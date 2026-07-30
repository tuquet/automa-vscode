import * as vscode from "vscode";
import * as path from "node:path";
import { TaskRunner } from "../core/TaskRunner";

export async function openInStudioCommand(uri: vscode.Uri) {
	if (!uri) {
		vscode.window.showErrorMessage("No workflow file selected.");
		return;
	}

	const displayName = path.basename(uri.fsPath);
	const args = ["automa", "studio", uri.fsPath];

	TaskRunner.run({
		id: displayName,
		name: `Open Studio: ${displayName}`,
		source: "Automa-Studio",
		args: args,
		startMessage: `Opening Automa Studio for: ${displayName}`,
		successMessage: `Studio session closed: ${displayName}`,
		errorMessage: `Studio session crashed: ${displayName}`,
		statusBarText: `Automa Studio: ${displayName}`
	});
}
