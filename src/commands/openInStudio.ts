import * as path from "node:path";
import * as vscode from "vscode";
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

	let workspaceRoot = "";
	if (
		vscode.workspace.workspaceFolders &&
		vscode.workspace.workspaceFolders.length > 0
	) {
		workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
		args.push("--vault-path", workspaceRoot);
	}

	if (userCliPath && require("node:fs").existsSync(userCliPath)) {
		cmd = "node";
		args = [userCliPath, "studio", uri.fsPath];
		if (workspaceRoot) args.push("--vault-path", workspaceRoot);
	} else if (workspaceRoot) {
		const fs = require("node:fs");
		const candidates = [
			path.join(workspaceRoot, "automa-cli", "dist", "cli.js"),
			path.join(workspaceRoot, "..", "automa-cli", "dist", "cli.js"),
		];
		const foundCli = candidates.find((p) => fs.existsSync(p));
		if (foundCli) {
			cmd = "node";
			args = [foundCli, "studio", uri.fsPath, "--vault-path", workspaceRoot];
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
		statusBarText: `Automa Studio: ${displayName}`,
	});
}
