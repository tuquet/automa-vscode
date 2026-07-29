import * as vscode from "vscode";
import { runWorkflowCommand } from "./runWorkflow";
import { openInStudioCommand } from "./openInStudio";

export function registerCommands(context: vscode.ExtensionContext) {
	const commands = [
		vscode.commands.registerCommand("automa.showWorkflowSource", (uri: vscode.Uri) => {
			if (uri) {
				vscode.commands.executeCommand("vscode.openWith", uri, "default");
			}
		}),
		vscode.commands.registerCommand("automa.showWorkflowPreview", (uri: vscode.Uri) => {
			if (uri) {
				vscode.commands.executeCommand("vscode.openWith", uri, "automa.workflowPreview");
			}
		}),
		vscode.commands.registerCommand("automa.runWorkflow", runWorkflowCommand),
		vscode.commands.registerCommand("automa.showLogSource", (uri: vscode.Uri) => {
			if (uri) {
				vscode.commands.executeCommand("vscode.openWith", uri, "default");
			} else {
				vscode.commands.executeCommand("workbench.action.reopenTextEditor");
			}
		}),
		vscode.commands.registerCommand("automa.showLogPreview", (uri: vscode.Uri) => {
			if (uri) {
				vscode.commands.executeCommand("vscode.openWith", uri, "automa.logEditor");
			}
		}),
		vscode.commands.registerCommand("automa.openInStudio", openInStudioCommand),
	];

	context.subscriptions.push(...commands);
}
