import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class VaultTreeDataProvider implements vscode.TreeDataProvider<VaultItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<VaultItem | undefined | void> = new vscode.EventEmitter<VaultItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<VaultItem | undefined | void> = this._onDidChangeTreeData.event;
    private watcherVariables: vscode.FileSystemWatcher | undefined;
    private watcherCredentials: vscode.FileSystemWatcher | undefined;

    constructor() {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const varsPattern = new vscode.RelativePattern(workspaceRoot, 'globals/variables.json');
            const credsPattern = new vscode.RelativePattern(workspaceRoot, 'globals/credentials.json');
            
            this.watcherVariables = vscode.workspace.createFileSystemWatcher(varsPattern);
            this.watcherVariables.onDidChange(() => this.refresh());
            this.watcherVariables.onDidCreate(() => this.refresh());
            this.watcherVariables.onDidDelete(() => this.refresh());

            this.watcherCredentials = vscode.workspace.createFileSystemWatcher(credsPattern);
            this.watcherCredentials.onDidChange(() => this.refresh());
            this.watcherCredentials.onDidCreate(() => this.refresh());
            this.watcherCredentials.onDidDelete(() => this.refresh());
        }
    }

    dispose() {
        if (this.watcherVariables) {
            this.watcherVariables.dispose();
        }
        if (this.watcherCredentials) {
            this.watcherCredentials.dispose();
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: VaultItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: VaultItem): Promise<VaultItem[]> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return [];
        }
        
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

        if (!element) {
            return [
                new VaultItem("Variables", vscode.TreeItemCollapsibleState.Expanded, "Category", "symbol-variable"),
                new VaultItem("Credentials", vscode.TreeItemCollapsibleState.Expanded, "Category", "shield")
            ];
        }

        if (element.type === "Category") {
            if (element.label === "Variables") {
                const varsPath = path.join(workspaceRoot, 'globals', 'variables.json');
                if (fs.existsSync(varsPath)) {
                    try {
                        const content = fs.readFileSync(varsPath, 'utf8');
                        const data = JSON.parse(content);
                        const items: VaultItem[] = [];
                        if (Array.isArray(data)) {
                            for (const item of data) {
                                const name = item.name || item.key || "Unnamed";
                                items.push(new VaultItem(name, vscode.TreeItemCollapsibleState.None, "Variable", "symbol-variable", item.value));
                            }
                        } else if (typeof data === 'object' && data !== null) {
                            for (const [key, value] of Object.entries(data)) {
                                items.push(new VaultItem(key, vscode.TreeItemCollapsibleState.None, "Variable", "symbol-variable", String(value)));
                            }
                        }
                        return items;
                    } catch (e) {
                        return [new VaultItem("Error reading variables.json", vscode.TreeItemCollapsibleState.None, "Error", "error")];
                    }
                }
                return [new VaultItem("No variables.json found", vscode.TreeItemCollapsibleState.None, "Info", "info")];
            } else if (element.label === "Credentials") {
                const credsPath = path.join(workspaceRoot, 'globals', 'credentials.json');
                if (fs.existsSync(credsPath)) {
                    try {
                        const content = fs.readFileSync(credsPath, 'utf8');
                        const data = JSON.parse(content);
                        const items: VaultItem[] = [];
                        if (Array.isArray(data)) {
                            for (const item of data) {
                                const name = item.name || item.id || "Unnamed";
                                items.push(new VaultItem(name, vscode.TreeItemCollapsibleState.None, "Credential", "key", "********"));
                            }
                        } else if (typeof data === 'object' && data !== null) {
                            for (const key of Object.keys(data)) {
                                items.push(new VaultItem(key, vscode.TreeItemCollapsibleState.None, "Credential", "key", "********"));
                            }
                        }
                        return items;
                    } catch (e) {
                        return [new VaultItem("Error reading credentials.json", vscode.TreeItemCollapsibleState.None, "Error", "error")];
                    }
                }
                return [new VaultItem("No credentials.json found", vscode.TreeItemCollapsibleState.None, "Info", "info")];
            }
        }

        return [];
    }
}

export class VaultItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: "Category" | "Variable" | "Credential" | "Info" | "Error",
        iconName: string,
        public readonly value?: string
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
