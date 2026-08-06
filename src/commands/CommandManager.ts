import * as vscode from "vscode";
import { runWorkflowCommand, runWorkflowWithParamsCommand } from "./runWorkflow";
import { runFleetCommand } from "./runFleet";
import { openInStudioCommand } from "./openInStudio";
import { fixWorkflowIdCommand } from "./fixWorkflowId";
import { lintCheckCommand } from "./lintCheck";
import { stopFleetCommand } from "./stopFleet";
import { killRunner } from "./killRunner";
import { showRunnerLogCommand } from "./showRunnerLog";
import { addVariableCommand, addCredentialCommand } from "./vaultCommands";
import { DaemonManager } from "../core/DaemonManager";
import { WelcomePanel } from "../panels/WelcomePanel";
import { LiveLogEditorProvider } from "../providers/LiveLogEditorProvider";
import { createWorkflowCommand, createPackageCommand, createProfileCommand } from "./createItem";

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
					try {
						await DaemonManager.getInstance().executeRawCliCommand(['install-browser']);
						vscode.window.showInformationMessage("Browser installed successfully!");
					} catch (err: any) {
						vscode.window.showErrorMessage(`Failed to install browser: ${err.message}`);
						throw err;
					}
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
			vscode.commands.registerCommand("automa.runWorkflowWithParams", runWorkflowWithParamsCommand),
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
			if (uri && uri.scheme === "automa-log") {
				const jobId = uri.authority || uri.path.replace(/^\//, ''); // handle automa-log://job-id or automa-log:job-id
				const { LogCustomEditorProvider } = require("../providers/LogCustomEditorProvider");
				LogCustomEditorProvider.showLogForJobId(this.context, jobId);
			} else if (uri) {
				vscode.commands.executeCommand("vscode.openWith", uri, "automa.logEditor");
			}
		}),
			vscode.commands.registerCommand("automa.openInStudio", openInStudioCommand),
			vscode.commands.registerCommand("automa.createWorkflow", createWorkflowCommand),
			vscode.commands.registerCommand("automa.createPackage", createPackageCommand),
			vscode.commands.registerCommand("automa.createProfile", createProfileCommand),
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
			vscode.commands.registerCommand("automa.addVariable", addVariableCommand),
			vscode.commands.registerCommand("automa.addCredential", addCredentialCommand),
			vscode.commands.registerCommand("automa.showLiveLog", (execution: vscode.TaskExecution) => {
				if (execution) {
					const taskId = execution.task.definition.id || execution.task.name;
					LiveLogEditorProvider.showLiveLog(this.context, taskId, execution.task.name);
				}
			}),
			vscode.commands.registerCommand("automa.vault.encryptSecret", async () => {
				const secretName = await vscode.window.showInputBox({
					prompt: "Enter the name for this credential",
					placeHolder: "e.g. GithubToken"
				});
				if (!secretName) return;

				const plaintext = await vscode.window.showInputBox({
					prompt: `Enter the secret value for '${secretName}'`,
					password: true
				});
				if (!plaintext) return;

				const passphrase = await vscode.window.showInputBox({
					prompt: "Enter your Automa Passphrase (or leave empty to use AUTOMA_PASSPHRASE env)",
					password: true
				});

				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders || workspaceFolders.length === 0) {
					vscode.window.showErrorMessage("No workspace open.");
					return;
				}
				const vaultPath = workspaceFolders[0].uri.fsPath;

				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: `Encrypting secret '${secretName}'...`,
					cancellable: false
				}, async () => {
					try {
						const args = ['encrypt-secret', plaintext, '--name', secretName, '-v', vaultPath];
						if (passphrase) {
							args.push('-p', passphrase);
						}
						await DaemonManager.getInstance().executeRawCliCommand(args);
						vscode.window.showInformationMessage(`Secret '${secretName}' encrypted and saved!`);
					} catch (err: any) {
						vscode.window.showErrorMessage(`Encryption failed: ${err.message}`);
						throw err;
					}
				});
			}),
		];

		this.context.subscriptions.push(...commands);
	}
}
