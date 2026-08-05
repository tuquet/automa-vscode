import * as vscode from "vscode";
import { Logger } from "./Logger";
import { CommandManager } from "../commands/CommandManager";
import { ProviderManager } from "../providers/ProviderManager";
import { activateLintDiagnostics } from "../commands/lintCheck";
import { DaemonManager } from "./DaemonManager";
import { HistoryTreeDataProvider } from "../providers/HistoryTreeDataProvider";

export class ExtensionApp {
	private static instance: ExtensionApp;
	private context!: vscode.ExtensionContext;
	private commandManager!: CommandManager;
	private providerManager!: ProviderManager;

	private constructor() {}

	public static getInstance(): ExtensionApp {
		if (!ExtensionApp.instance) {
			ExtensionApp.instance = new ExtensionApp();
		}
		return ExtensionApp.instance;
	}

	public activate(context: vscode.ExtensionContext) {
		this.context = context;

		// Initialize Logger
		Logger.initialize(context);
		Logger.info("Automa VS Code Extension is now active!");

		// Initialize Diagnostics
		activateLintDiagnostics(context);

		// Show welcome popup only once
		this.showWelcomePopupOnce();

		// Initialize Managers
		this.providerManager = new ProviderManager(context);
		this.commandManager = new CommandManager(context);

		// Register Providers & Commands
		this.providerManager.registerAll();
		this.commandManager.registerAll();

		// Sync preview setting
		this.initializeSettingsSync();

		// Start Backend Daemon
		DaemonManager.getInstance().start();

		const historyProvider = new HistoryTreeDataProvider(this.context);
		vscode.window.registerTreeDataProvider("automa.executionHistory", historyProvider);
		
		// Register history filtering commands
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.filterHistoryByTaskId", async () => {
				const taskId = await vscode.window.showInputBox({
					prompt: "Enter Task ID to filter history",
					placeHolder: "e.g. tsk_dev002"
				});
				if (taskId) {
					historyProvider.setFilter(taskId);
				}
			}),
			vscode.commands.registerCommand("automa.clearHistoryFilter", () => {
				historyProvider.clearFilter();
			}),
			vscode.commands.registerCommand("automa.clearHistory", async () => {
				const cliPath = DaemonManager.getInstance().resolveCliPath(this.context.extensionPath);
				const cmd = cliPath.endsWith('.ts') ? 'npx tsx' : 'node';
				await require('util').promisify(require('child_process').exec)(`${cmd} "${cliPath}" history --clear`);
				historyProvider.refresh();
			})
		);
	}

	public deactivate() {
		// Cleanup resources if needed
		DaemonManager.getInstance().stop();
	}

	private showWelcomePopupOnce() {
		const hasShownWelcome = this.context.globalState.get<boolean>("automa.hasShownWelcome");
		if (!hasShownWelcome) {
			vscode.commands.executeCommand("automa.welcome");
			this.context.globalState.update("automa.hasShownWelcome", true);
		}
	}

	private initializeSettingsSync() {
		this.syncPreviewSetting();

		this.context.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration("automa.preview.defaultOnClick")) {
					this.syncPreviewSetting();
				}
			})
		);
	}

	private syncPreviewSetting() {
		const config = vscode.workspace.getConfiguration("automa");
		const defaultOnClick = config.get<boolean>("preview.defaultOnClick", true);
		
		const workbenchConfig = vscode.workspace.getConfiguration("workbench");
		let editorAssociations: Record<string, string> = workbenchConfig.get("editorAssociations") || {};
		
		let updated = false;

		// Automate *.workflow.json -> automa.workflowPreview
		const currentWorkflowAssoc = editorAssociations["*.workflow.json"];
		if (defaultOnClick && currentWorkflowAssoc !== "automa.workflowPreview") {
			editorAssociations["*.workflow.json"] = "automa.workflowPreview";
			updated = true;
		} else if (!defaultOnClick && currentWorkflowAssoc === "automa.workflowPreview") {
			editorAssociations["*.workflow.json"] = "default";
			updated = true;
		}

		// Automate *.fleets.json -> automa.fleetPreview
		const currentFleetAssoc = editorAssociations["*.fleets.json"];
		if (defaultOnClick && currentFleetAssoc !== "automa.fleetPreview") {
			editorAssociations["*.fleets.json"] = "automa.fleetPreview";
			updated = true;
		} else if (!defaultOnClick && currentFleetAssoc === "automa.fleetPreview") {
			editorAssociations["*.fleets.json"] = "default";
			updated = true;
		}

		if (updated) {
			workbenchConfig.update("editorAssociations", editorAssociations, vscode.ConfigurationTarget.Global);
		}
	}
}
