import * as vscode from "vscode";
import * as path from "node:path";

export async function runFleetCommand(nodeOrUri?: any) {
	let targetPath = "";
	let displayName = "";

	if (nodeOrUri?.fsPath) {
		targetPath = nodeOrUri.fsPath;
		displayName = path.basename(nodeOrUri.fsPath);
	} else {
		vscode.window.showErrorMessage("Run Fleet must be triggered from a .fleets.json file.");
		return;
	}

	const options = await vscode.window.showQuickPick([
		{ label: "$(play) Run Now", description: "Run all tasks immediately (ignore schedules)" },
		{ label: "$(clock) Start Daemon", description: "Start the fleet in background and wait for cron schedules" }
	], { placeHolder: "How do you want to run this fleet?" });

	if (!options) return;
	const isRunNow = options.label.includes("Run Now");

	const args = ["automa", "fleet", "start", targetPath];
	if (isRunNow) {
		args.push("--run-now");
	}

	vscode.window.showInformationMessage(`Starting Fleet Orchestrator: ${displayName}`);

	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = `$(sync~spin) Fleet Orchestrator: ${displayName}`;
	statusBarItem.show();

	const isWin = process.platform === "win32";
	const command = isWin ? "npx.cmd" : "npx";

	const task = new vscode.Task(
		{ type: "automa", id: `fleet-orchestrator-${Date.now()}` },
		vscode.workspace.workspaceFolders?.[0] || vscode.TaskScope.Workspace,
		`Fleet: ${displayName}`,
		"Automa",
		new vscode.ProcessExecution(command, args)
	);

	task.presentationOptions = {
		reveal: vscode.TaskRevealKind.Always,
		panel: vscode.TaskPanelKind.Shared
	};

	vscode.tasks.executeTask(task);

	const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
		if (e.execution.task === task) {
			statusBarItem.hide();
			statusBarItem.dispose();
			disposable.dispose();
			
			if (e.exitCode === 0) {
				vscode.window.showInformationMessage(`Fleet Orchestrator finished: ${displayName}`);
			} else {
				vscode.window.showErrorMessage(`Fleet Orchestrator exited with code ${e.exitCode}`);
			}
		}
	});
}
