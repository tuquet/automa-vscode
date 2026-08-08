import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";
import { extractFsPath } from "../utils/typeGuards";

export async function openInStudioCommand(
	nodeOrUri?: unknown,
	nodesOrUris?: unknown[],
) {
	const targetPaths: string[] = [];

	if (Array.isArray(nodesOrUris) && nodesOrUris.length > 0) {
		for (const n of nodesOrUris) {
			const p = extractFsPath(n);
			if (p?.endsWith(".json")) {
				targetPaths.push(p);
			}
		}
	} else {
		const p = extractFsPath(nodeOrUri);
		if (p?.endsWith(".json")) {
			targetPaths.push(p);
		} else {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor?.document.uri.fsPath.endsWith(".json")) {
				targetPaths.push(activeEditor.document.uri.fsPath);
			} else {
				const uris = await vscode.window.showOpenDialog({
					canSelectMany: true,
					openLabel: "Open in Studio",
					filters: {
						"JSON files": ["json"],
					},
				});
				if (uris && uris.length > 0) {
					for (const uri of uris) {
						targetPaths.push(uri.fsPath);
					}
				}
			}
		}
	}

	if (targetPaths.length === 0) return;

	for (const targetPath of targetPaths) {
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
			id: `studio-${Date.now()}-${Math.random().toString(36).substring(7)}`,
			name: `Open Studio: ${displayName}`,
			source: "Automa-Studio",
			startMessage: `Opening Automa Studio for: ${displayName}`,
			successMessage: `Studio session closed: ${displayName}`,
			errorMessage: `Studio session crashed: ${displayName}`,
			statusBarText: `Automa Studio: ${displayName}`,
			useTelemetry: false,
		});
	}
}
