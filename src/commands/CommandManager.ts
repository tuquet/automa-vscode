import * as vscode from "vscode";
import { runWorkflowCommand } from "./runWorkflow";
import { runFleetCommand } from "./runFleet";
import { openInStudioCommand } from "./openInStudio";
import { fixWorkflowIdCommand } from "./fixWorkflowId";
import { lintCheckCommand } from "./lintCheck";
import { stopFleetCommand } from "./stopFleet";
import { killRunner } from "./killRunner";
import { showRunnerLogCommand } from "./showRunnerLog";
import { DaemonManager } from "../core/DaemonManager";
import { WelcomePanel } from "../panels/WelcomePanel";
import { exec } from "child_process";

export class CommandManager {
	private readonly context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	public registerAll() {
		const commands = [
			vscode.commands.registerCommand("automa.welcome", () => {
				WelcomePanel.createOrShow(this.context.extensionUri);
			}),
			vscode.commands.registerCommand("automa.installBrowser", () => {
				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: "Installing Automa Browser...",
					cancellable: false
				}, async (progress) => {
					return new Promise<void>((resolve, reject) => {
						exec("npx tuquet-automa-cli install-browser", (err, stdout, stderr) => {
							if (err) {
								vscode.window.showErrorMessage(`Failed to install browser: ${stderr}`);
								reject(err);
							} else {
								vscode.window.showInformationMessage("Browser installed successfully!");
								resolve();
							}
						});
					});
				});
			}),
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
			vscode.commands.registerCommand("automa.toggleDaemon", () => {
				const daemon = (DaemonManager as any).getInstance();
				if (daemon.daemonProcess) {
					daemon.stop();
				} else {
					daemon.start();
				}
			}),
			vscode.commands.registerCommand("automa.killRunner", killRunner),
			vscode.commands.registerCommand("automa.showRunnerLog", showRunnerLogCommand),
		];

		this.context.subscriptions.push(...commands);
	}
}
