import * as vscode from "vscode";
import { runWorkflowCommand } from "./runWorkflow";
import { runFleetCommand } from "./runFleet";
import { openInStudioCommand } from "./openInStudio";
import { fixWorkflowIdCommand } from "./fixWorkflowId";
import { lintCheckCommand } from "./lintCheck";
import { stopFleetCommand } from "./stopFleet";

export class CommandManager {
	private readonly context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	public registerAll() {
		const commands = [
			vscode.commands.registerCommand("automa.showWorkflowSource", async (uri: vscode.Uri) => {
				if (uri) {
					await vscode.workspace.getConfiguration("automa").update("preview.defaultOnClick", false, vscode.ConfigurationTarget.Global);
					vscode.commands.executeCommand("vscode.openWith", uri, "default");
				}
			}),
			vscode.commands.registerCommand("automa.showWorkflowPreview", async (uri: vscode.Uri) => {
				if (uri) {
					await vscode.workspace.getConfiguration("automa").update("preview.defaultOnClick", true, vscode.ConfigurationTarget.Global);
					vscode.commands.executeCommand("vscode.openWith", uri, "automa.workflowPreview");
				}
			}),
			vscode.commands.registerCommand("automa.showFleetSource", async (uri: vscode.Uri) => {
				if (uri) {
					vscode.commands.executeCommand("vscode.openWith", uri, "default");
				}
			}),
			vscode.commands.registerCommand("automa.showFleetPreview", async (uri: vscode.Uri) => {
				if (uri) {
					vscode.commands.executeCommand("vscode.openWith", uri, "automa.fleetPreview");
				}
			}),
			vscode.commands.registerCommand("automa.runWorkflow", runWorkflowCommand),
			vscode.commands.registerCommand("automa.runFleet", runFleetCommand),
			vscode.commands.registerCommand("automa.stopFleet", stopFleetCommand),
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
			vscode.commands.registerCommand("automa.fixWorkflowId", fixWorkflowIdCommand),
			vscode.commands.registerCommand("automa.lintCheck", lintCheckCommand),
		];

		this.context.subscriptions.push(...commands);
	}
}
