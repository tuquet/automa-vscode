import * as vscode from "vscode";

export class RunnersTreeDataProvider
	implements vscode.TreeDataProvider<vscode.TaskExecution>
{
	private _onDidChangeTreeData: vscode.EventEmitter<
		vscode.TaskExecution | undefined | void
	> = new vscode.EventEmitter<vscode.TaskExecution | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<
		vscode.TaskExecution | undefined | void
	> = this._onDidChangeTreeData.event;
	private treeView?: vscode.TreeView<vscode.TaskExecution>;
	public statusBarItem: vscode.StatusBarItem;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.statusBarItem.command = "automa-activity-bar.focus"; // Focus the automa activity bar (Wait, what is the view container command? Usually `workbench.view.extension.automa-activity-bar`)
		// Actually, I can just register a command that focuses the active runners panel: "automa.activeRunners.focus"
		this.statusBarItem.command = "automa.focusActiveRunners";
		
		// Listen for tasks starting and ending to auto-refresh the list
		vscode.tasks.onDidStartTask((e) => {
			if (
				e.execution.task.source &&
				e.execution.task.source.startsWith("Automa")
			) {
				this.refresh();
			}
		});

		vscode.tasks.onDidEndTask((e) => {
			if (
				e.execution.task.source &&
				e.execution.task.source.startsWith("Automa")
			) {
				this.refresh();
			}
		});
	}

	public setTreeView(view: vscode.TreeView<vscode.TaskExecution>) {
		this.treeView = view;
	}

	refresh(): void {
		if (this.treeView) {
			const runners = vscode.tasks.taskExecutions.filter(
				(execution) =>
					execution.task.source && execution.task.source.startsWith("Automa"),
			);

			if (runners.length > 0) {
				this.treeView.badge = {
					value: runners.length,
					tooltip: `${runners.length} Active Runner(s)`,
				};
				this.statusBarItem.text = `$(rocket) Automa: ${runners.length} Running`;
				this.statusBarItem.tooltip = "Click to view active runners";
				this.statusBarItem.show();
			} else {
				this.treeView.badge = undefined;
				this.statusBarItem.hide();
			}
		}
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TaskExecution): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(
			element.task.name,
			vscode.TreeItemCollapsibleState.None,
		);

		// Use a spinning sync icon to indicate the task is running
		treeItem.iconPath = new vscode.ThemeIcon("sync~spin");
		treeItem.contextValue = "automaRunner";
		treeItem.tooltip = `Running: ${element.task.name}`;
		treeItem.description = "Running";

		// Click to view log detail
		treeItem.command = {
			command: "automa.showRunnerLog",
			title: "Show Log Detail",
			arguments: [element],
		};

		return treeItem;
	}

	getChildren(
		element?: vscode.TaskExecution,
	): Thenable<vscode.TaskExecution[]> {
		if (element) {
			// Runners are flat, no children
			return Promise.resolve([]);
		} else {
			// Return all running tasks that originate from Automa (e.g. Automa, Automa-Studio)
			const runners = vscode.tasks.taskExecutions.filter(
				(execution) =>
					execution.task.source && execution.task.source.startsWith("Automa"),
			);
			return Promise.resolve(runners);
		}
	}
}
