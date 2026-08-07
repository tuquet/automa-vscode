import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";
import { AutomaFilesProvider } from "./AutomaFilesProvider";
import { BrowserProfileEditorProvider } from "./BrowserProfileEditorProvider";
import { FleetPreviewEditorProvider } from "./FleetPreviewEditorProvider";
import { HistoryTreeDataProvider } from "./HistoryTreeDataProvider";
import { LogCustomEditorProvider } from "./LogCustomEditorProvider";
import { RunnersTreeDataProvider } from "./RunnersTreeDataProvider";
import { VaultTreeDataProvider } from "./VaultTreeDataProvider";
import { WorkflowPreviewEditorProvider } from "./WorkflowPreviewEditorProvider";

export class ProviderManager {
	private readonly context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	public registerAll() {
		// Register Custom Editor Provider for .automa-log.json
		this.context.subscriptions.push(
			vscode.window.registerCustomEditorProvider(
				LogCustomEditorProvider.viewType,
				new LogCustomEditorProvider(this.context),
				{
					webviewOptions: {
						retainContextWhenHidden: true,
					},
					supportsMultipleEditorsPerDocument: false,
				},
			),
		);

		// Register Custom Editor Provider for .workflow.json
		this.context.subscriptions.push(
			vscode.window.registerCustomEditorProvider(
				WorkflowPreviewEditorProvider.viewType,
				new WorkflowPreviewEditorProvider(this.context),
				{
					webviewOptions: {
						retainContextWhenHidden: true,
					},
					supportsMultipleEditorsPerDocument: false,
				},
			),
		);

		// Register Custom Editor Provider for .fleets.json / .fleet.json
		this.context.subscriptions.push(
			vscode.window.registerCustomEditorProvider(
				FleetPreviewEditorProvider.viewType,
				new FleetPreviewEditorProvider(this.context),
				{
					webviewOptions: {
						retainContextWhenHidden: true,
					},
					supportsMultipleEditorsPerDocument: false,
				},
			),
		);

		// Register Custom Editor Provider for .profile.json
		this.context.subscriptions.push(
			vscode.window.registerCustomEditorProvider(
				BrowserProfileEditorProvider.viewType,
				new BrowserProfileEditorProvider(this.context),
				{
					webviewOptions: {
						retainContextWhenHidden: true,
					},
					supportsMultipleEditorsPerDocument: false,
				},
			),
		);

		// --- TREE VIEWS --- //

		// 1. Active Runners Panel
		const runnersProvider = new RunnersTreeDataProvider();
		this.context.subscriptions.push(runnersProvider.statusBarItem);

		const treeView = vscode.window.createTreeView("automa.activeRunners", {
			treeDataProvider: runnersProvider,
		});
		runnersProvider.setTreeView(treeView);
		treeView.onDidChangeVisibility((e) => {
			if (e.visible) {
				runnersProvider.refresh();
			}
		});

		this.context.subscriptions.push(treeView);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.focusActiveRunners", () => {
				vscode.commands.executeCommand("automa.activeRunners.focus");
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshRunners", () => {
				runnersProvider.refresh();
			}),
		);
		runnersProvider.refresh();
		// 1.5. Execution History Panel
		const historyProvider = new HistoryTreeDataProvider(this.context);
		const historyTreeView = vscode.window.createTreeView(
			"automa.executionHistory",
			{
				treeDataProvider: historyProvider,
			},
		);
		this.context.subscriptions.push(historyTreeView);

		historyTreeView.onDidChangeVisibility((e) => {
			if (e.visible) {
				historyProvider.refresh();
			}
		});
		historyProvider.registerCommands();

		// 2. Profiles Panel
		const profilesProvider = new AutomaFilesProvider(
			"**/*.profile.json",
			"account",
			"automa.browserProfiles",
		);
		profilesProvider.register(this.context, "Profiles");

		// 3. Workflows Panel
		const workflowsProvider = new AutomaFilesProvider(
			"**/*.workflow.json",
			"file-code",
			"automa.workflows",
			"workflow",
		);
		workflowsProvider.register(this.context, "Workflows");

		// 4. Packages Panel
		const packagesProvider = new AutomaFilesProvider(
			"**/*.package.json",
			"package",
			"automa.packages",
			"package",
		);
		packagesProvider.register(this.context, "Packages");

		// 5. Fleets Panel
		const fleetsProvider = new AutomaFilesProvider(
			"**/*.fleet.json",
			"rocket",
			"automa.fleets",
		);
		fleetsProvider.register(this.context, "Fleets");


		// 6. Global Vault Panel
		const vaultProvider = new VaultTreeDataProvider();
		this.context.subscriptions.push(
			vscode.window.createTreeView("automa.globalVault", {
				treeDataProvider: vaultProvider,
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshVault", () => {
				vaultProvider.refresh();
			}),
		);
	}
}
