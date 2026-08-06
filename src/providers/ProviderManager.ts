import * as vscode from "vscode";
import { LogCustomEditorProvider } from "./LogCustomEditorProvider";
import { WorkflowPreviewEditorProvider } from "./WorkflowPreviewEditorProvider";
import { FleetPreviewEditorProvider } from "./FleetPreviewEditorProvider";
import { BrowserProfileEditorProvider } from "./BrowserProfileEditorProvider";
import { RunnersTreeDataProvider } from "./RunnersTreeDataProvider";
import { HistoryTreeDataProvider } from "./HistoryTreeDataProvider";
import { AutomaFilesProvider } from "./AutomaFilesProvider";
import { VaultTreeDataProvider } from "./VaultTreeDataProvider";
import { DaemonManager } from "../core/DaemonManager";

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
				}
			)
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
				}
			)
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
				}
			)
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
				}
			)
		);

		// --- TREE VIEWS --- //

		// 1. Active Runners Panel
		const runnersProvider = new RunnersTreeDataProvider();
		
		const treeView = vscode.window.createTreeView("automa.activeRunners", { 
			treeDataProvider: runnersProvider 
		});
		runnersProvider.setTreeView(treeView);
		
		this.context.subscriptions.push(treeView);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshRunners", () => {
				runnersProvider.refresh();
			})
		);
		runnersProvider.refresh();
		// 1.5. Execution History Panel
		const historyProvider = new HistoryTreeDataProvider(this.context);
		this.context.subscriptions.push(
			vscode.window.createTreeView("automa.executionHistory", { treeDataProvider: historyProvider })
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshHistory", () => {
				historyProvider.refresh();
			})
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.filterHistoryByTaskId", async () => {
				const taskId = await vscode.window.showInputBox({
					prompt: "Enter Task ID to filter history",
					placeHolder: "e.g. tsk_dev002"
				});
				if (taskId) {
					historyProvider.setFilter(taskId);
				}
			})
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.clearHistoryFilter", () => {
				historyProvider.clearFilter();
			})
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.deleteHistoryItem", async (item: vscode.TreeItem) => {
				if (!item || !item.id) return;
				const confirm = await vscode.window.showWarningMessage(`Are you sure you want to delete this log?`, "Yes", "No");
				if (confirm !== "Yes") return;

				try {
					await DaemonManager.getInstance().executeCliCommand(['history', '--delete', item.id]);
					historyProvider.refresh();
				} catch (err: any) {
					vscode.window.showErrorMessage(`Failed to delete log: ${err.message}`);
				}
			})
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.clearHistory", async () => {
				const confirm = await vscode.window.showWarningMessage(`Are you sure you want to clear all execution history?`, "Yes", "No");
				if (confirm !== "Yes") return;

				try {
					await DaemonManager.getInstance().executeCliCommand(['history', '--clear']);
					historyProvider.refresh();
				} catch (err: any) {
					vscode.window.showErrorMessage(`Failed to clear history: ${err.message}`);
				}
			})
		);

		// 2. Profiles Panel
		const profilesProvider = new AutomaFilesProvider('**/*.profile.json', 'account', 'automa.browserProfiles');
		this.context.subscriptions.push(
			vscode.window.createTreeView("automa.browserProfiles", { treeDataProvider: profilesProvider })
		);
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.refreshProfiles", () => {
			profilesProvider.setSearchQuery('');
		}));
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.searchProfiles", async () => {
			const query = await vscode.window.showInputBox({ placeHolder: "Search Browser Profiles..." });
			if (query !== undefined) profilesProvider.setSearchQuery(query);
		}));
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.clearSearchProfiles", () => profilesProvider.setSearchQuery('')));

		// 3. Workflows Panel
		const workflowsProvider = new AutomaFilesProvider('**/*.workflow.json', 'file-code', 'automa.workflows', 'workflow');
		this.context.subscriptions.push(
			vscode.window.createTreeView("automa.workflows", { treeDataProvider: workflowsProvider })
		);
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.refreshWorkflows", () => {
			workflowsProvider.setSearchQuery('');
		}));
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.searchWorkflows", async () => {
			const query = await vscode.window.showInputBox({ placeHolder: "Search Workflows..." });
			if (query !== undefined) workflowsProvider.setSearchQuery(query);
		}));
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.clearSearchWorkflows", () => workflowsProvider.setSearchQuery('')));

		// 4. Packages Panel
		const packagesProvider = new AutomaFilesProvider('**/*.package.json', 'package', 'automa.packages', 'package');
		this.context.subscriptions.push(
			vscode.window.createTreeView("automa.packages", { treeDataProvider: packagesProvider })
		);
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.refreshPackages", () => {
			packagesProvider.setSearchQuery('');
		}));
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.searchPackages", async () => {
			const query = await vscode.window.showInputBox({ placeHolder: "Search Packages..." });
			if (query !== undefined) packagesProvider.setSearchQuery(query);
		}));
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.clearSearchPackages", () => packagesProvider.setSearchQuery('')));

		// 5. Fleets Panel
		const fleetsProvider = new AutomaFilesProvider('**/*.fleet.json', 'rocket', 'automa.fleets');
		this.context.subscriptions.push(
			vscode.window.createTreeView("automa.fleets", { treeDataProvider: fleetsProvider })
		);
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.refreshFleets", () => {
			fleetsProvider.setSearchQuery('');
		}));
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.searchFleets", async () => {
			const query = await vscode.window.showInputBox({ placeHolder: "Search Fleets..." });
			if (query !== undefined) fleetsProvider.setSearchQuery(query);
		}));
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.clearSearchFleets", () => fleetsProvider.setSearchQuery('')));

		// 6. Global Vault Panel
		const vaultProvider = new VaultTreeDataProvider();
		this.context.subscriptions.push(
			vscode.window.createTreeView("automa.globalVault", { treeDataProvider: vaultProvider })
		);
		this.context.subscriptions.push(vscode.commands.registerCommand("automa.refreshVault", () => {
			vaultProvider.refresh();
		}));
	}
}
