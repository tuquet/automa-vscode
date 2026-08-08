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

	register(context: vscode.ExtensionContext, entityName: string) {
		const treeView = vscode.window.createTreeView(this.viewId, {
			treeDataProvider: this,
		});
		context.subscriptions.push(treeView);
		treeView.onDidChangeVisibility((e) => {
			if (e.visible) this.refresh();
		});

		context.subscriptions.push(
			vscode.commands.registerCommand(`automa.refresh${entityName}`, () => {
				this.refresh();
			}),
		);
		context.subscriptions.push(
			vscode.commands.registerCommand(
				`automa.search${entityName}`,
				async () => {
					const query = await vscode.window.showInputBox({
						placeHolder: `Search ${entityName}...`,
					});
					if (query !== undefined) await this.setSearchQuery(query);
				},
			),
		);
		context.subscriptions.push(
			vscode.commands.registerCommand(
				`automa.clearSearch${entityName}`,
				async () => await this.setSearchQuery(""),
			),
		);
	}

	refresh(): void {
		this._cachedChildren = this.fetchChildren();
		this._onDidChangeTreeData.fire(undefined);
	}

	async setSearchQuery(query: string): Promise<void> {
		this.searchQuery = query.toLowerCase();
		await vscode.commands.executeCommand(
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
		const files = await vscode.workspace.findFiles(
			this.globPattern,
			"**/{node_modules,.git,dist,out,.gemini,tmp,build}/**",
		);

		let filteredFiles = files;
		if (this.filterType !== "all") {
			const parseErrors: string[] = [];
			const filterResults = await Promise.all(
				files.map(async (file) => {
					try {
						const contentArray = await vscode.workspace.fs.readFile(file);
						const content = Buffer.from(contentArray).toString("utf8");
						const json = JSON.parse(content);
						const isPackage =
							(
								(json as Record<string, unknown>).settings as Record<
									string,
									unknown
								>
							)?.asBlock === true ||
							Array.isArray((json as Record<string, unknown>).inputs) ||
							Array.isArray((json as Record<string, unknown>).outputs);

						if (this.filterType === "package") return isPackage;
						if (this.filterType === "workflow") return !isPackage;
					} catch (e: unknown) {
						const msg = e instanceof Error ? e.message : String(e);
						parseErrors.push(`${path.basename(file.fsPath)}: ${msg}`);
						// If parsing fails, consider it a normal workflow by default
						return this.filterType === "workflow";
					}
					return false;
				}),
			);

			if (parseErrors.length > 0) {
				const limit = 3;
				const displayErrors = parseErrors.slice(0, limit).join(", ");
				const more =
					parseErrors.length > limit
						? ` and ${parseErrors.length - limit} more`
						: "";
				vscode.window.showWarningMessage(
					`Failed to parse ${parseErrors.length} file(s) for ${this.viewId}: ${displayErrors}${more}`,
				);
			}

			filteredFiles = files.filter((_, index) => filterResults[index]);
		}

		let result = filteredFiles.map((file) => {
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
