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

	public register(context: vscode.ExtensionContext) {
		const treeView = vscode.window.createTreeView("automa.executionHistory", {
			treeDataProvider: this,
		});
		context.subscriptions.push(treeView);

		treeView.onDidChangeVisibility((e) => {
			if (e.visible) {
				this.refresh();
			}
		});

		this.registerCommands();
	}

	public registerCommands() {
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshHistory", () => {
				this.refresh();
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.history.loadMore", () => {
				this.loadMore();
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand(
				"automa.filterHistoryByTaskId",
				async () => {
					const taskId = await vscode.window.showInputBox({
						prompt: "Enter Task ID to filter history",
						placeHolder: "e.g. tsk_dev002",
					});
					if (taskId) {
						this.setFilter(taskId);
					}
				},
			),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.clearHistoryFilter", () => {
				this.clearFilter();
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand(
				"automa.deleteHistoryItem",
				(item: vscode.TreeItem) => this.handleDeleteHistoryItem(item),
			),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.clearHistory", () =>
				this.handleClearHistory(),
			),
		);
	}

	private async handleDeleteHistoryItem(item: vscode.TreeItem) {
		if (!item?.id) return;
		const confirm = await vscode.window.showWarningMessage(
			`Are you sure you want to delete this log?`,
			"Yes",
			"No",
		);
		if (confirm !== "Yes") return;

		try {
			const daemon = DaemonManager.getInstance();
			const port = daemon.getPort();
			const res = await fetch(`http://localhost:${port}/api/jobs/${item.id}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Daemon not ready");
			this.refresh();
		} catch (_err: unknown) {
			try {
				await DaemonManager.getInstance().executeCliCommand([
					"history",
					"--delete",
					item.id,
				]);
				this.refresh();
			} catch (cliErr: unknown) {
				const msg = cliErr instanceof Error ? cliErr.message : String(cliErr);
				vscode.window.showErrorMessage(`Failed to delete log: ${msg}`);
			}
		}
	}

	private async handleClearHistory() {
		const confirm = await vscode.window.showWarningMessage(
			`Are you sure you want to clear all execution history?`,
			"Yes",
			"No",
		);
		if (confirm !== "Yes") return;

		try {
			const daemon = DaemonManager.getInstance();
			const port = daemon.getPort();
			const res = await fetch(`http://localhost:${port}/api/jobs`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Daemon not ready");
			this.refresh();
		} catch (_err: unknown) {
			try {
				await DaemonManager.getInstance().executeCliCommand([
					"history",
					"--clear",
				]);
				this.refresh();
			} catch (cliErr: unknown) {
				const msg = cliErr instanceof Error ? cliErr.message : String(cliErr);
				vscode.window.showErrorMessage(`Failed to clear history: ${msg}`);
			}
		}
	}

	loadMore() {
		this.currentLimit += 50;
		this.refresh();
	}

	async setFilter(taskId: string) {
		this.taskIdFilter = taskId;
		await vscode.commands.executeCommand(
			"setContext",
			"automa.history.isFiltered",
			true,
		);
		this.currentLimit = 50;
		this.refresh();
	}

	async clearFilter() {
		this.taskIdFilter = undefined;
		await vscode.commands.executeCommand(
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
			let jobs: any;

			try {
				const daemon = DaemonManager.getInstance();
				const port = daemon.getPort();
				let url = `http://localhost:${port}/api/jobs/history?limit=${this.currentLimit}`;
				if (this.taskIdFilter) {
					url += `&taskId=${encodeURIComponent(this.taskIdFilter)}`;
				}
				const res = await fetch(url);
				if (!res.ok) throw new Error("Daemon not ready");
				jobs = await res.json();
			} catch (_err) {
				const args = ["history", "--limit", this.currentLimit.toString()];
				if (this.taskIdFilter) {
					args.push("--task-id", this.taskIdFilter);
				}
				jobs = await DaemonManager.getInstance().executeCliCommand(args);
			}

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
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			const errorItem = new vscode.TreeItem(
				"Error loading history",
				vscode.TreeItemCollapsibleState.None,
			);
			errorItem.description = msg;
			return [errorItem];
		}
	}
}
