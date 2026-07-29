import * as path from "node:path";
import * as vscode from "vscode";
import { TerminalManager } from "../core/TerminalManager";

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
	
	const uri = targetPath ? vscode.Uri.file(targetPath) : undefined;
	const config = vscode.workspace.getConfiguration("automa", uri);
	
	const globalVariables = config.get<any>("vault.run.globalVariables", {});
	if (globalVariables && typeof globalVariables === 'object') {
		finalParams = { ...globalVariables, ...finalParams };
	}

	if (Object.keys(finalParams).length > 0) {
		args.push("-v");
		args.push(JSON.stringify(finalParams));
	}

	const useDefaults = config.get<boolean>("run.useDefaultParameters", false);
	// Nếu chạy từ màn hình UI Form (params !== undefined), ta coi như Form đã thay thế 
	// bước nhập liệu của CLI, do đó tự động truyền --yes để CLI bỏ qua interactive prompt.
	if (useDefaults || params !== undefined) {
		args.push("--yes");
	}

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
