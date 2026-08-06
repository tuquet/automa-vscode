import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export class AutomaFilesProvider implements vscode.TreeDataProvider<FileItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<
		FileItem | undefined | undefined
	> = new vscode.EventEmitter<FileItem | undefined | undefined>();
	readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | undefined> =
		this._onDidChangeTreeData.event;
	private searchQuery: string = "";
	private watcher: vscode.FileSystemWatcher;

	private _cachedChildren: Promise<FileItem[]> | undefined;

	constructor(
		private globPattern: string,
		private iconName: string,
		private viewId: string,
		private filterType: "all" | "workflow" | "package" = "all",
	) {
		this.watcher = vscode.workspace.createFileSystemWatcher(this.globPattern);
		this.watcher.onDidCreate(() => this.refresh());
		this.watcher.onDidChange(() => this.refresh());
		this.watcher.onDidDelete(() => this.refresh());

		// Preload data
		this.refresh();
	}

	dispose() {
		this.watcher.dispose();
	}

	refresh(): void {
		this._cachedChildren = this.fetchChildren();
		this._onDidChangeTreeData.fire(undefined);
	}

	setSearchQuery(query: string): void {
		this.searchQuery = query.toLowerCase();
		vscode.commands.executeCommand(
			"setContext",
			`${this.viewId}.isFiltered`,
			this.searchQuery !== "",
		);
		this.refresh();
	}

	getTreeItem(element: FileItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: FileItem): Promise<FileItem[]> {
		if (element) {
			return Promise.resolve([]);
		}

		if (this._cachedChildren) {
			return this._cachedChildren;
		}

		this._cachedChildren = this.fetchChildren();
		return this._cachedChildren;
	}

	private async fetchChildren(): Promise<FileItem[]> {
		let files = await vscode.workspace.findFiles(
			this.globPattern,
			"**/node_modules/**",
		);

		if (this.filterType !== "all") {
			files = files.filter((file) => {
				try {
					const content = fs.readFileSync(file.fsPath, "utf8");
					const json = JSON.parse(content);
					const isPackage =
						json.settings?.asBlock === true ||
						Array.isArray(json.inputs) ||
						Array.isArray(json.outputs);

					if (this.filterType === "package") return isPackage;
					if (this.filterType === "workflow") return !isPackage;
				} catch (_e) {
					// If parsing fails, consider it a normal workflow by default
					return this.filterType === "workflow";
				}
				return false;
			});
		}

		let result = files.map((file) => {
			return new FileItem(
				path.basename(file.fsPath),
				file,
				vscode.TreeItemCollapsibleState.None,
				this.iconName,
				this.viewId,
			);
		});

		if (this.searchQuery) {
			result = result.filter((item) =>
				item.label.toLowerCase().includes(this.searchQuery),
			);
		}

		return result.sort((a, b) => a.label.localeCompare(b.label));
	}
}

class FileItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly resourceUri: vscode.Uri,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly iconName: string,
		public readonly viewId: string,
	) {
		super(label, collapsibleState);

		this.id = this.resourceUri.toString();
		this.tooltip = this.resourceUri.fsPath;
		this.description = vscode.workspace.asRelativePath(
			path.dirname(this.resourceUri.fsPath),
		);

		this.iconPath = new vscode.ThemeIcon(iconName);

		// When clicked, open the file (which triggers the custom editor if configured)
		this.command = {
			command: "vscode.open",
			title: "Open File",
			arguments: [this.resourceUri],
		};

		// Define context value for view-specific actions
		this.contextValue = `automaFileItem-${viewId}`;
	}
}
