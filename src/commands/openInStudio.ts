import * as vscode from "vscode";
import * as path from "path";

export async function openInStudioCommand(uri: vscode.Uri) {
	if (!uri) {
		vscode.window.showErrorMessage("No workflow file selected.");
		return;
	}

	const displayName = path.basename(uri.fsPath);
	const args = ["automa", "studio", uri.fsPath];

	vscode.window.showInformationMessage(`Opening Automa Studio for: ${displayName}`);

	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = `$(sync~spin) Automa Studio: ${displayName}`;
	statusBarItem.show();

	const isWin = process.platform === "win32";
	const command = isWin ? "npx.cmd" : "npx";

	const task = new vscode.Task(
		{ type: "automa-studio", id: displayName },
		vscode.workspace.workspaceFolders?.[0] || vscode.TaskScope.Workspace,
		`Open Studio: ${displayName}`,
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
				vscode.window.showInformationMessage(`Studio session closed: ${displayName}`);
			} else {
				vscode.window.showErrorMessage(`Studio session crashed: ${displayName} (Exit code ${e.exitCode})`);
			}
		}
	});
}
