import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";

export async function openInStudioCommand(uri: vscode.Uri) {
	if (!uri) {
		vscode.window.showErrorMessage("No workflow file selected.");
		return;
	}

	const displayName = path.basename(uri.fsPath);
	const args = ["studio", uri.fsPath];

	if (
		vscode.workspace.workspaceFolders &&
		vscode.workspace.workspaceFolders.length > 0
	) {
		const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
		args.push("--vault-path", workspaceRoot);
	}

	await TaskRunner.runAutomaCli(args, {
		id: displayName,
		name: `Open Studio: ${displayName}`,
		source: "Automa-Studio",
		startMessage: `Opening Automa Studio for: ${displayName}`,
		successMessage: `Studio session closed: ${displayName}`,
		errorMessage: `Studio session crashed: ${displayName}`,
		statusBarText: `Automa Studio: ${displayName}`,
		useTelemetry: false,
	});
}
