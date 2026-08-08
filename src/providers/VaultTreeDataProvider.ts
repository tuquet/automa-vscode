import * as vscode from "vscode";

export class VaultTreeDataProvider
	implements vscode.TreeDataProvider<VaultItem>
{
	private _onDidChangeTreeData: vscode.EventEmitter<
		VaultItem | undefined | undefined
	> = new vscode.EventEmitter<VaultItem | undefined | undefined>();
	readonly onDidChangeTreeData: vscode.Event<
		VaultItem | undefined | undefined
	> = this._onDidChangeTreeData.event;
	private watcherVariables: vscode.FileSystemWatcher | undefined;
	private watcherCredentials: vscode.FileSystemWatcher | undefined;
	private watcherTables: vscode.FileSystemWatcher | undefined;

	constructor() {
		if (
			vscode.workspace.workspaceFolders &&
			vscode.workspace.workspaceFolders.length > 0
		) {
			const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
			const varsPattern = new vscode.RelativePattern(
				workspaceRoot,
				"**/*.variable.json",
			);
			const credsPattern = new vscode.RelativePattern(
				workspaceRoot,
				"**/*.credential.json",
			);
			const tablesPattern = new vscode.RelativePattern(
				workspaceRoot,
				"**/*.table.json",
			);

			this.watcherVariables =
				vscode.workspace.createFileSystemWatcher(varsPattern);
			this.watcherVariables.onDidChange(() => this.refresh());
			this.watcherVariables.onDidCreate(() => this.refresh());
			this.watcherVariables.onDidDelete(() => this.refresh());

			this.watcherCredentials =
				vscode.workspace.createFileSystemWatcher(credsPattern);
			this.watcherCredentials.onDidChange(() => this.refresh());
			this.watcherCredentials.onDidCreate(() => this.refresh());
			this.watcherCredentials.onDidDelete(() => this.refresh());

			this.watcherTables =
				vscode.workspace.createFileSystemWatcher(tablesPattern);
			this.watcherTables.onDidChange(() => this.refresh());
			this.watcherTables.onDidCreate(() => this.refresh());
			this.watcherTables.onDidDelete(() => this.refresh());
		}
	}

	dispose() {
		if (this.watcherVariables) {
			this.watcherVariables.dispose();
		}
		if (this.watcherCredentials) {
			this.watcherCredentials.dispose();
		}
		if (this.watcherTables) {
			this.watcherTables.dispose();
		}
	}

	public register(context: vscode.ExtensionContext) {
		const treeView = vscode.window.createTreeView("automa.globalVault", {
			treeDataProvider: this,
		});
		context.subscriptions.push(treeView);

		context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshVault", () => {
				this.refresh();
			}),
		);
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: VaultItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: VaultItem): Promise<VaultItem[]> {
		if (
			!vscode.workspace.workspaceFolders ||
			vscode.workspace.workspaceFolders.length === 0
		) {
			return [];
		}

		const _workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

		if (!element) {
			return [
				new VaultItem(
					"Variables",
					vscode.TreeItemCollapsibleState.Expanded,
					"Category",
					"symbol-variable",
				),
				new VaultItem(
					"Credentials",
					vscode.TreeItemCollapsibleState.Expanded,
					"Category",
					"shield",
				),
				new VaultItem(
					"Tables",
					vscode.TreeItemCollapsibleState.Expanded,
					"Category",
					"list-flat",
				),
			];
		}

		if (element.type === "Category") {
			if (element.label === "Variables") {
				return await this.getVariables();
			} else if (element.label === "Credentials") {
				return await this.getCredentials();
			} else if (element.label === "Tables") {
				return await this.getTables();
			}
		}

		return [];
	}

	private async getVariables(): Promise<VaultItem[]> {
		return this.parseVaultFiles(
			"**/*.variable.json",
			"Variable",
			"symbol-variable",
			"Unnamed",
			"Error reading variables",
			"No *.variable.json found",
			(item, isArray, _key, val) =>
				isArray ? (item.value as string | undefined) : String(val),
			true,
		);
	}

	private async getCredentials(): Promise<VaultItem[]> {
		return this.parseVaultFiles(
			"**/*.credential.json",
			"Credential",
			"key",
			"Unnamed",
			"Error reading credentials",
			"No *.credential.json found",
			() => "********",
			true,
		);
	}

	private async getTables(): Promise<VaultItem[]> {
		return this.parseVaultFiles(
			"**/*.table.json",
			"Table",
			"list-flat",
			"Unnamed Table",
			"Error reading tables",
			"No *.table.json found",
			(item) => (item.id ? `ID: ${item.id}` : "Table"),
			false,
		);
	}

	private async parseVaultFiles(
		pattern: string,
		type: "Variable" | "Credential" | "Table",
		iconName: string,
		defaultName: string,
		errorMsg: string,
		noFilesMsg: string,
		extractValue: (
			item: Record<string, unknown>,
			isArray: boolean,
			key?: string,
			val?: unknown,
		) => string | undefined,
		allowObjects: boolean,
	): Promise<VaultItem[]> {
		const files = await vscode.workspace.findFiles(
			pattern,
			"**/{node_modules,.git,dist,out,.gemini,tmp,build}/**",
		);
		if (files.length > 0) {
			try {
				const items: VaultItem[] = [];
				const parseErrors: string[] = [];
				for (const file of files) {
					try {
						const content = await vscode.workspace.fs.readFile(file);
						const data = JSON.parse(Buffer.from(content).toString("utf-8"));
						if (Array.isArray(data)) {
							for (const item of data) {
								const name = item.name || item.id || item.key || defaultName;
								const id = item.id || item.key || item.name;
								const value = extractValue(item, true);
								items.push(
									new VaultItem(
										name,
										vscode.TreeItemCollapsibleState.None,
										type,
										iconName,
										value,
										file,
										id,
									),
								);
							}
						} else if (
							allowObjects &&
							typeof data === "object" &&
							data !== null
						) {
							for (const [key, val] of Object.entries(data)) {
								const value = extractValue(data, false, key, val);
								items.push(
									new VaultItem(
										key,
										vscode.TreeItemCollapsibleState.None,
										type,
										iconName,
										value,
										file,
										key,
									),
								);
							}
						}
					} catch (e: unknown) {
						const msg = e instanceof Error ? e.message : String(e);
						parseErrors.push(
							`Failed to parse vault file ${file.fsPath}: ${msg}`,
						);
					}
				}
				if (parseErrors.length > 0) {
					const limit = 3;
					const displayErrors = parseErrors.slice(0, limit).join("\n");
					const more =
						parseErrors.length > limit
							? `\n...and ${parseErrors.length - limit} more`
							: "";
					vscode.window.showWarningMessage(
						`Failed to parse ${parseErrors.length} vault file(s):\n${displayErrors}${more}`,
					);
				}
				return items;
			} catch (_e: unknown) {
				return [
					new VaultItem(
						errorMsg,
						vscode.TreeItemCollapsibleState.None,
						"Error",
						"error",
					),
				];
			}
		}
		return [
			new VaultItem(
				noFilesMsg,
				vscode.TreeItemCollapsibleState.None,
				"Info",
				"info",
			),
		];
	}
}

export class VaultItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly type:
			| "Category"
			| "Variable"
			| "Credential"
			| "Table"
			| "Info"
			| "Error",
		iconName: string,
		public readonly value?: string,
		public readonly resourceUri?: vscode.Uri,
		public readonly itemId?: string,
	) {
		super(label, collapsibleState);
		this.iconPath = new vscode.ThemeIcon(iconName);
		this.contextValue = type;
		if (value !== undefined) {
			this.description = value;
			this.tooltip = `${label}: ${value}`;
		}
		if (resourceUri) {
			this.command = {
				command: "vscode.open",
				title: "Open File",
				arguments: [resourceUri],
			};
		}
	}
}
