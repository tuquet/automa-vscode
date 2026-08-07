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
				const files = await vscode.workspace.findFiles(
					"**/*.variable.json",
					"**/{node_modules,.git,dist,out,.gemini,tmp,build}/**",
				);
				if (files.length > 0) {
					try {
						const items: VaultItem[] = [];
						for (const file of files) {
							try {
								const content = await vscode.workspace.fs.readFile(file);
								const data = JSON.parse(Buffer.from(content).toString("utf-8"));
								if (Array.isArray(data)) {
									for (const item of data) {
										const name = item.name || item.key || "Unnamed";
										items.push(
											new VaultItem(
												name,
												vscode.TreeItemCollapsibleState.None,
												"Variable",
												"symbol-variable",
												item.value,
											),
										);
									}
								} else if (typeof data === "object" && data !== null) {
									for (const [key, value] of Object.entries(data)) {
										items.push(
											new VaultItem(
												key,
												vscode.TreeItemCollapsibleState.None,
												"Variable",
												"symbol-variable",
												String(value),
											),
										);
									}
								}
							} catch (_e) {}
						}
						return items;
					} catch (_e) {
						return [
							new VaultItem(
								"Error reading variables",
								vscode.TreeItemCollapsibleState.None,
								"Error",
								"error",
							),
						];
					}
				}
				return [
					new VaultItem(
						"No *.variable.json found",
						vscode.TreeItemCollapsibleState.None,
						"Info",
						"info",
					),
				];
			} else if (element.label === "Credentials") {
				const files = await vscode.workspace.findFiles(
					"**/*.credential.json",
					"**/{node_modules,.git,dist,out,.gemini,tmp,build}/**",
				);
				if (files.length > 0) {
					try {
						const items: VaultItem[] = [];
						for (const file of files) {
							try {
								const content = await vscode.workspace.fs.readFile(file);
								const data = JSON.parse(Buffer.from(content).toString("utf-8"));
								if (Array.isArray(data)) {
									for (const item of data) {
										const name = item.name || item.id || "Unnamed";
										items.push(
											new VaultItem(
												name,
												vscode.TreeItemCollapsibleState.None,
												"Credential",
												"key",
												"********",
											),
										);
									}
								} else if (typeof data === "object" && data !== null) {
									for (const key of Object.keys(data)) {
										items.push(
											new VaultItem(
												key,
												vscode.TreeItemCollapsibleState.None,
												"Credential",
												"key",
												"********",
											),
										);
									}
								}
							} catch (_e) {}
						}
						return items;
					} catch (_e) {
						return [
							new VaultItem(
								"Error reading credentials",
								vscode.TreeItemCollapsibleState.None,
								"Error",
								"error",
							),
						];
					}
				}
				return [
					new VaultItem(
						"No *.credential.json found",
						vscode.TreeItemCollapsibleState.None,
						"Info",
						"info",
					),
				];
			} else if (element.label === "Tables") {
				const files = await vscode.workspace.findFiles(
					"**/*.table.json",
					"**/{node_modules,.git,dist,out,.gemini,tmp,build}/**",
				);
				if (files.length > 0) {
					try {
						const items: VaultItem[] = [];
						for (const file of files) {
							try {
								const content = await vscode.workspace.fs.readFile(file);
								const data = JSON.parse(Buffer.from(content).toString("utf-8"));
								if (Array.isArray(data)) {
									for (const item of data) {
										const name = item.name || item.id || "Unnamed Table";
										items.push(
											new VaultItem(
												name,
												vscode.TreeItemCollapsibleState.None,
												"Table",
												"list-flat",
												item.id ? `ID: ${item.id}` : "Table",
											),
										);
									}
								}
							} catch (_e) {}
						}
						return items;
					} catch (_e) {
						return [
							new VaultItem(
								"Error reading tables",
								vscode.TreeItemCollapsibleState.None,
								"Error",
								"error",
							),
						];
					}
				}
				return [
					new VaultItem(
						"No *.table.json found",
						vscode.TreeItemCollapsibleState.None,
						"Info",
						"info",
					),
				];
			}
		}

		return [];
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
	) {
		super(label, collapsibleState);
		this.iconPath = new vscode.ThemeIcon(iconName);
		this.contextValue = type;
		if (value !== undefined) {
			this.description = value;
			this.tooltip = `${label}: ${value}`;
		}
	}
}
