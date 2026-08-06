import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";

export class HistoryTreeDataProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>
{
	private _onDidChangeTreeData: vscode.EventEmitter<
		vscode.TreeItem | undefined | undefined
	> = new vscode.EventEmitter<vscode.TreeItem | undefined | undefined>();
	readonly onDidChangeTreeData: vscode.Event<
		vscode.TreeItem | undefined | undefined
	> = this._onDidChangeTreeData.event;
	private taskIdFilter: string | undefined;
	private currentLimit: number = 50;
	private _cachedChildren: Promise<vscode.TreeItem[]> | undefined;
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;

		// Preload data
		this.refresh();
	}

	loadMore() {
		this.currentLimit += 50;
		this.refresh();
	}

	setFilter(taskId: string) {
		this.taskIdFilter = taskId;
		vscode.commands.executeCommand(
			"setContext",
			"automa.history.isFiltered",
			true,
		);
		this.currentLimit = 50;
		this.refresh();
	}

	clearFilter() {
		this.taskIdFilter = undefined;
		vscode.commands.executeCommand(
			"setContext",
			"automa.history.isFiltered",
			false,
		);
		this.currentLimit = 50;
		this.refresh();
	}

	refresh(): void {
		this._cachedChildren = this.fetchChildren();
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (element) {
			return Promise.resolve([]);
		}

		if (this._cachedChildren) {
			return this._cachedChildren;
		}

		this._cachedChildren = this.fetchChildren();
		return this._cachedChildren;
	}

	private async fetchChildren(): Promise<vscode.TreeItem[]> {
		try {
			const args = ["history", "--limit", this.currentLimit.toString()];
			if (this.taskIdFilter) {
				args.push("--task-id", this.taskIdFilter);
			}

			const jobs = await DaemonManager.getInstance().executeCliCommand(args);

			if (!jobs || jobs.length === 0) {
				const msg = this.taskIdFilter
					? `No jobs found for Task ID: ${this.taskIdFilter}`
					: "No history found";
				const emptyItem = new vscode.TreeItem(
					msg,
					vscode.TreeItemCollapsibleState.None,
				);
				emptyItem.description = this.taskIdFilter
					? "Clear filter to see all"
					: "Run a workflow first";
				return [emptyItem];
			}

			const treeItems = jobs.map((job: any) => {
				const treeItem = new vscode.TreeItem(
					job.name || "Unknown",
					vscode.TreeItemCollapsibleState.None,
				);
				treeItem.id = job.id;

				let icon = "circle-outline";
				if (job.status === "completed" || job.status === "success")
					icon = "pass";
				else if (job.status === "failed" || job.status === "error")
					icon = "error";
				else if (job.status === "running" || job.status === "active")
					icon = "sync~spin";

				treeItem.iconPath = new vscode.ThemeIcon(icon);
				treeItem.contextValue = "automaHistoryLog";

				const dateStr = new Date(job.created_at).toLocaleString("vi-VN", {
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit",
				});
				treeItem.description = `${dateStr} - ${job.status}`;
				treeItem.tooltip = `Job ID: ${job.id}\nStatus: ${job.status}\nCreated: ${job.created_at}`;

				treeItem.command = {
					command: "automa.showLogPreview",
					title: "Show Log Detail",
					arguments: [vscode.Uri.parse(`automa-log://${job.id}`)],
				};

				return treeItem;
			});

			if (jobs.length >= this.currentLimit) {
				const loadMoreItem = new vscode.TreeItem(
					"Load More...",
					vscode.TreeItemCollapsibleState.None,
				);
				loadMoreItem.iconPath = new vscode.ThemeIcon("sync");
				loadMoreItem.command = {
					command: "automa.history.loadMore",
					title: "Load More",
				};
				treeItems.push(loadMoreItem);
			}

			return treeItems;
		} catch (err: any) {
			const errorItem = new vscode.TreeItem(
				"Error loading history",
				vscode.TreeItemCollapsibleState.None,
			);
			errorItem.description = err.message;
			return [errorItem];
		}
	}
}
