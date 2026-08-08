import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";
import { extractFsPath } from "../utils/typeGuards";

export async function openInStudioCommand(nodeOrUri: unknown) {
	let targetPath = extractFsPath(nodeOrUri);

	if (!targetPath) {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor?.document.uri.fsPath.endsWith(".json")) {
			targetPath = activeEditor.document.uri.fsPath;
		} else {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: "Open in Studio",
				filters: {
					"JSON files": ["json"],
				},
			});
			if (!uris || uris.length === 0) return;
			targetPath = uris[0].fsPath;
		}
	}

	const displayName = path.basename(targetPath);
	const args = ["studio", targetPath];

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
