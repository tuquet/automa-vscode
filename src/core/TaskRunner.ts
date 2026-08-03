import * as vscode from "vscode";

export interface TaskOptions {
	id: string;
	name: string;
	command?: string;
	source?: string;
	args: string[];
	startMessage?: string;
	successMessage?: string;
	errorMessage?: string;
	statusBarText?: string;
}

export class TaskRunner {
	public static run(options: TaskOptions): void {
		if (options.startMessage) {
			vscode.window.showInformationMessage(options.startMessage);
		}

		let statusBarItem: vscode.StatusBarItem | undefined;
		if (options.statusBarText) {
			statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
			statusBarItem.text = `$(sync~spin) ${options.statusBarText}`;
			statusBarItem.show();
		}

		const isWin = process.platform === "win32";
		const defaultCommand = isWin ? "npx.cmd" : "npx";
		const command = options.command || defaultCommand;

		const config = vscode.workspace.getConfiguration("automa");
		const browserPathOverride = config.get<string>("browserPathOverride") || "";
		
		const env = { ...process.env };
		if (browserPathOverride) {
			env["AUTOMA_BROWSER_PATH"] = browserPathOverride;
		}

		const task = new vscode.Task(
			{ type: "automa", id: options.id },
			vscode.workspace.workspaceFolders?.[0] || vscode.TaskScope.Workspace,
			options.name,
			options.source || "Automa",
			new vscode.ProcessExecution(command, options.args, { env })
		);

		task.presentationOptions = {
			reveal: vscode.TaskRevealKind.Always,
			panel: vscode.TaskPanelKind.Shared
		};

		vscode.tasks.executeTask(task);

		const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
			if (e.execution.task === task) {
				if (statusBarItem) {
					statusBarItem.hide();
					statusBarItem.dispose();
				}
				disposable.dispose();
				
				if (e.exitCode === 0) {
					if (options.successMessage) {
						vscode.window.showInformationMessage(options.successMessage);
					}
				} else {
					if (options.errorMessage) {
						vscode.window.showErrorMessage(`${options.errorMessage} (Exit code ${e.exitCode})`);
					}
				}
			}
		});
	}
}
