import * as path from "node:path";
import * as vscode from "vscode";

export async function runWorkflowCommand(nodeOrUri?: any, params?: any) {
	let targetPath = "";
	let displayName = "";

	if (nodeOrUri?.fsPath) {
		// Local file triggered from VS Code Explorer or Editor
		targetPath = nodeOrUri.fsPath;
		displayName = path.basename(nodeOrUri.fsPath);
	} else if (nodeOrUri?.fullPath) {
		// Local file triggered from Automa TreeView
		targetPath = nodeOrUri.fullPath;
		displayName = nodeOrUri.label;
	} else {
		// Manual input
		const input = await vscode.window.showInputBox({
			prompt: "Enter absolute path to workflow JSON or Workflow ID (if cloud)",
			placeHolder: "e.g. C:\\path\\to\\workflow.json or daily-checkin",
		});
		if (!input) return;

		targetPath = input;
		displayName = input;
	}

	const args = ["automa", "run"];
	if (targetPath.endsWith(".json")) {
		args.push(targetPath);
	} else {
		args.push("--id", targetPath);
	}

	let finalParams = params ? { ...params } : {};

	if (Object.keys(finalParams).length > 0) {
		args.push("-v");
		args.push(JSON.stringify(finalParams));
	}

	const config = vscode.workspace.getConfiguration("automa");
	const logPath = config.get<string>("vault.run.logPath");
	if (logPath && logPath.trim() !== "") {
		// Assuming automa-cli accepts --log-path or similar
		args.push("--log-path", logPath);
	}

	const isDebug = config.get<boolean>("vault.run.debug");
	if (isDebug) {
		args.push("--debug");
	}

	// Removed --yes flag since automa-cli run command doesn't define or require it
	// when a workflow path is explicitly provided.

	vscode.window.showInformationMessage(`Running workflow: ${displayName}`);
	
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = `$(sync~spin) Automa: Running ${displayName}`;
	statusBarItem.show();

	const isWin = process.platform === "win32";
	const command = isWin ? "npx.cmd" : "npx";

	const task = new vscode.Task(
		{ type: "automa", id: displayName },
		vscode.workspace.workspaceFolders?.[0] || vscode.TaskScope.Workspace,
		`Run ${displayName}`,
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
				vscode.window.showInformationMessage(`Workflow finished successfully: ${displayName}`);
			} else {
				vscode.window.showErrorMessage(`Workflow execution failed: ${displayName} (Exit code ${e.exitCode})`);
			}
		}
	});
}
