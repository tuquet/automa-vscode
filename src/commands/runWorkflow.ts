import * as path from "node:path";
import * as vscode from "vscode";
import { TerminalManager } from "../core/TerminalManager";

export async function runWorkflowCommand(nodeOrUri?: any) {
	let commandArgs = "";
	let displayName = "";

	if (nodeOrUri?.fsPath) {
		// Local file triggered from VS Code Explorer or Editor
		commandArgs = `"${nodeOrUri.fsPath}"`;
		displayName = path.basename(nodeOrUri.fsPath);
	} else if (nodeOrUri?.fullPath) {
		// Local file triggered from Automa TreeView
		commandArgs = `"${nodeOrUri.fullPath}"`;
		displayName = nodeOrUri.label;
	} else {
		// Manual input
		const input = await vscode.window.showInputBox({
			prompt: "Enter absolute path to workflow JSON or Workflow ID (if cloud)",
			placeHolder: "e.g. C:\\path\\to\\workflow.json or daily-checkin",
		});
		if (!input) return;

		if (input.endsWith(".json")) {
			commandArgs = `"${input}"`;
		} else {
			commandArgs = `--id "${input}"`;
		}
		displayName = input;
	}

	vscode.window.showInformationMessage(`Running workflow: ${displayName}`);
	TerminalManager.sendCommand(`npx automa run ${commandArgs}`);
}
