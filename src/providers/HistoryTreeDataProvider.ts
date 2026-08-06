import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";

export class HistoryTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;
	private context: vscode.ExtensionContext;
	private taskIdFilter: string | undefined;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	setFilter(taskId: string) {
		this.taskIdFilter = taskId;
		vscode.commands.executeCommand('setContext', 'automa.history.isFiltered', true);
		this.refresh();
	}

	clearFilter() {
		this.taskIdFilter = undefined;
		vscode.commands.executeCommand('setContext', 'automa.history.isFiltered', false);
		this.refresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (element) {
			return Promise.resolve([]);
		} else {
			try {
				const args = ['history', '--limit', '50'];
				if (this.taskIdFilter) {
					args.push('--task-id', this.taskIdFilter);
				}
				
				const jobs = await DaemonManager.getInstance().executeCliCommand(args);

				if (!jobs || jobs.length === 0) {
					const msg = this.taskIdFilter ? `No jobs found for Task ID: ${this.taskIdFilter}` : "No history found";
					const emptyItem = new vscode.TreeItem(msg, vscode.TreeItemCollapsibleState.None);
					emptyItem.description = this.taskIdFilter ? "Clear filter to see all" : "Run a workflow first";
					return [emptyItem];
				}

				return jobs.map((job: any) => {
					const treeItem = new vscode.TreeItem(job.name || "Unknown", vscode.TreeItemCollapsibleState.None);
					treeItem.id = job.id;
					
					let icon = "circle-outline";
					if (job.status === "completed" || job.status === "success") icon = "pass";
					else if (job.status === "failed" || job.status === "error") icon = "error";
					else if (job.status === "running" || job.status === "active") icon = "sync~spin";

					treeItem.iconPath = new vscode.ThemeIcon(icon);
					treeItem.contextValue = "automaHistoryLog";
					
					const dateStr = new Date(job.created_at).toLocaleString('vi-VN', {
						month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
					});
					treeItem.description = `${dateStr} - ${job.status}`;
					treeItem.tooltip = `Job ID: ${job.id}\nStatus: ${job.status}\nCreated: ${job.created_at}`;

					treeItem.command = {
						command: "automa.showLogPreview",
						title: "Show Log Detail",
						arguments: [vscode.Uri.parse(`automa-log://${job.id}`)]
					};

					return treeItem;
				});

			} catch (err: any) {
				const errorItem = new vscode.TreeItem("Error loading history", vscode.TreeItemCollapsibleState.None);
				errorItem.description = err.message;
				return [errorItem];
			}
		}
	}
}
