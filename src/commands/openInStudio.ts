import * as vscode from "vscode";
import * as path from "node:path";
import { TaskRunner } from "../core/TaskRunner";

export async function openInStudioCommand(uri: vscode.Uri) {
	if (!uri) {
		vscode.window.showErrorMessage("No workflow file selected.");
		return;
	}

	const displayName = path.basename(uri.fsPath);
	
	const config = vscode.workspace.getConfiguration("automa");
	const userCliPath = config.get<string>("cliPath");
	const isWin = process.platform === "win32";
	
	let cmd = isWin ? "npx.cmd" : "npx";
	let args = ["-y", "tuquet-automa-cli@latest", "studio", uri.fsPath];

	if (userCliPath && require("node:fs").existsSync(userCliPath)) {
		cmd = "node";
		args = [userCliPath, "studio", uri.fsPath];
	} else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
		const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const localCliPath = path.join(workspaceRoot, "..", "automa-cli", "dist", "cli.js");
		if (require("node:fs").existsSync(localCliPath)) {
			cmd = "node";
			args = [localCliPath, "studio", uri.fsPath];
		}
	}

	TaskRunner.run({
		id: displayName,
		name: `Open Studio: ${displayName}`,
		command: cmd,
		source: "Automa-Studio",
		args: args,
		startMessage: `Opening Automa Studio for: ${displayName}`,
		successMessage: `Studio session closed: ${displayName}`,
		errorMessage: `Studio session crashed: ${displayName}`,
		statusBarText: `Automa Studio: ${displayName}`
	});
}
