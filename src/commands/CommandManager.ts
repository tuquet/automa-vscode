import * as vscode from "vscode";
import {
	createPackageCommand,
	createProfileCommand,
	createWorkflowCommand,
} from "./createItem";
import { fixWorkflowIdCommand } from "./fixWorkflowId";
import { killRunner } from "./killRunner";
import { lintCheckCommand } from "./lintCheck";
import { runFleetCommand } from "./runFleet";
import {
	runWorkflowCommand,
	runWorkflowWithParamsCommand,
} from "./runWorkflow";
import { stopFleetCommand } from "./stopFleet";
import {
	installBrowserCommand,
	toggleDaemonCommand,
	welcomeCommand,
} from "./systemCommands";
import {
	addCredentialCommand,
	addTableCommand,
	addVariableCommand,
	deleteVaultItemCommand,
	encryptSecretCommand,
} from "./vaultCommands";
import {
	openInStudioCommand,
	showFleetPreviewCommand,
	showFleetSourceCommand,
	showLiveLogCommand,
	showLogPreviewCommand,
	showLogSourceCommand,
	showWorkflowPreviewCommand,
	showWorkflowSourceCommand,
} from "./viewCommands";

export class CommandManager {
	private readonly context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	public registerAll() {
		const commands = [
			vscode.commands.registerCommand(
				"automa.welcome",
				welcomeCommand(this.context),
			),
			vscode.commands.registerCommand(
				"automa.installBrowser",
				installBrowserCommand(),
			),
			vscode.commands.registerCommand(
				"automa.showWorkflowSource",
				showWorkflowSourceCommand(),
			),
			vscode.commands.registerCommand(
				"automa.showWorkflowPreview",
				showWorkflowPreviewCommand(),
			),
			vscode.commands.registerCommand(
				"automa.showFleetSource",
				showFleetSourceCommand(),
			),
			vscode.commands.registerCommand(
				"automa.showFleetPreview",
				showFleetPreviewCommand(),
			),
			vscode.commands.registerCommand("automa.runWorkflow", runWorkflowCommand),
			vscode.commands.registerCommand(
				"automa.runWorkflowWithParams",
				runWorkflowWithParamsCommand,
			),
			vscode.commands.registerCommand("automa.runFleet", runFleetCommand),
			vscode.commands.registerCommand("automa.stopFleet", stopFleetCommand),
			vscode.commands.registerCommand(
				"automa.showLogSource",
				showLogSourceCommand(),
			),
			vscode.commands.registerCommand(
				"automa.showLogPreview",
				showLogPreviewCommand(this.context),
			),
			vscode.commands.registerCommand(
				"automa.openInStudio",
				openInStudioCommand(this.context),
			),
			vscode.commands.registerCommand(
				"automa.createWorkflow",
				createWorkflowCommand,
			),
			vscode.commands.registerCommand(
				"automa.createPackage",
				createPackageCommand,
			),
			vscode.commands.registerCommand(
				"automa.createProfile",
				createProfileCommand,
			),
			vscode.commands.registerCommand(
				"automa.fixWorkflowId",
				fixWorkflowIdCommand,
			),
			vscode.commands.registerCommand("automa.lintCheck", lintCheckCommand),
			vscode.commands.registerCommand(
				"automa.toggleDaemon",
				toggleDaemonCommand(),
			),
			vscode.commands.registerCommand("automa.killRunner", killRunner),
			vscode.commands.registerCommand("automa.addVariable", addVariableCommand),
			vscode.commands.registerCommand(
				"automa.addCredential",
				addCredentialCommand,
			),
			vscode.commands.registerCommand("automa.addTable", addTableCommand),
			vscode.commands.registerCommand(
				"automa.showLiveLog",
				showLiveLogCommand(this.context),
			),
			vscode.commands.registerCommand(
				"automa.vault.encryptSecret",
				encryptSecretCommand,
			),
			vscode.commands.registerCommand(
				"automa.deleteVaultItem",
				deleteVaultItemCommand,
			),
		];

		this.context.subscriptions.push(...commands);
	}
}
