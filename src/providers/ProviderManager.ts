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
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshHistory", () => {
				historyProvider.refresh();
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.history.loadMore", () => {
				historyProvider.loadMore();
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand(
				"automa.filterHistoryByTaskId",
				async () => {
					const taskId = await vscode.window.showInputBox({
						prompt: "Enter Task ID to filter history",
						placeHolder: "e.g. tsk_dev002",
					});
					if (taskId) {
						historyProvider.setFilter(taskId);
					}
				},
			),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.clearHistoryFilter", () => {
				historyProvider.clearFilter();
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand(
				"automa.deleteHistoryItem",
				async (item: vscode.TreeItem) => {
					if (!item?.id) return;
					const confirm = await vscode.window.showWarningMessage(
						`Are you sure you want to delete this log?`,
						"Yes",
						"No",
					);
					if (confirm !== "Yes") return;

					try {
						await DaemonManager.getInstance().executeCliCommand([
							"history",
							"--delete",
							item.id,
						]);
						historyProvider.refresh();
					} catch (err: any) {
						vscode.window.showErrorMessage(
							`Failed to delete log: ${err.message}`,
						);
					}
				},
			),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.clearHistory", async () => {
				const confirm = await vscode.window.showWarningMessage(
					`Are you sure you want to clear all execution history?`,
					"Yes",
					"No",
				);
				if (confirm !== "Yes") return;

				try {
					await DaemonManager.getInstance().executeCliCommand([
						"history",
						"--clear",
					]);
					historyProvider.refresh();
				} catch (err: any) {
					vscode.window.showErrorMessage(
						`Failed to clear history: ${err.message}`,
					);
				}
			}),
		);

		// 2. Profiles Panel
		const profilesProvider = new AutomaFilesProvider(
			"**/*.profile.json",
			"account",
			"automa.browserProfiles",
		);
		const profilesTreeView = vscode.window.createTreeView(
			"automa.browserProfiles",
			{
				treeDataProvider: profilesProvider,
			},
		);
		this.context.subscriptions.push(profilesTreeView);
		profilesTreeView.onDidChangeVisibility((e) => {
			if (e.visible) profilesProvider.setSearchQuery("");
		});
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshProfiles", () => {
				profilesProvider.setSearchQuery("");
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.searchProfiles", async () => {
				const query = await vscode.window.showInputBox({
					placeHolder: "Search Browser Profiles...",
				});
				if (query !== undefined) profilesProvider.setSearchQuery(query);
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.clearSearchProfiles", () =>
				profilesProvider.setSearchQuery(""),
			),
		);

		// 3. Workflows Panel
		const workflowsProvider = new AutomaFilesProvider(
			"**/*.workflow.json",
			"file-code",
			"automa.workflows",
			"workflow",
		);
		const workflowsTreeView = vscode.window.createTreeView("automa.workflows", {
			treeDataProvider: workflowsProvider,
		});
		this.context.subscriptions.push(workflowsTreeView);
		workflowsTreeView.onDidChangeVisibility((e) => {
			if (e.visible) workflowsProvider.setSearchQuery("");
		});
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshWorkflows", () => {
				workflowsProvider.setSearchQuery("");
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.searchWorkflows", async () => {
				const query = await vscode.window.showInputBox({
					placeHolder: "Search Workflows...",
				});
				if (query !== undefined) workflowsProvider.setSearchQuery(query);
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.clearSearchWorkflows", () =>
				workflowsProvider.setSearchQuery(""),
			),
		);

		// 4. Packages Panel
		const packagesProvider = new AutomaFilesProvider(
			"**/*.package.json",
			"package",
			"automa.packages",
			"package",
		);
		const packagesTreeView = vscode.window.createTreeView("automa.packages", {
			treeDataProvider: packagesProvider,
		});
		this.context.subscriptions.push(packagesTreeView);
		packagesTreeView.onDidChangeVisibility((e) => {
			if (e.visible) packagesProvider.setSearchQuery("");
		});
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshPackages", () => {
				packagesProvider.setSearchQuery("");
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.searchPackages", async () => {
				const query = await vscode.window.showInputBox({
					placeHolder: "Search Packages...",
				});
				if (query !== undefined) packagesProvider.setSearchQuery(query);
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.clearSearchPackages", () =>
				packagesProvider.setSearchQuery(""),
			),
		);

		// 5. Fleets Panel
		const fleetsProvider = new AutomaFilesProvider(
			"**/*.fleet.json",
			"rocket",
			"automa.fleets",
		);
		const fleetsTreeView = vscode.window.createTreeView("automa.fleets", {
			treeDataProvider: fleetsProvider,
		});
		this.context.subscriptions.push(fleetsTreeView);
		fleetsTreeView.onDidChangeVisibility((e) => {
			if (e.visible) fleetsProvider.setSearchQuery("");
		});

		// 6. Global File System Watcher
		const vaultWatcher = vscode.workspace.createFileSystemWatcher(
			"**/*.{profile,workflow,package,fleet}.json",
		);
		this.context.subscriptions.push(vaultWatcher);
		const refreshAll = () => {
			workflowsProvider.setSearchQuery("");
			fleetsProvider.setSearchQuery("");
			packagesProvider.setSearchQuery("");
			profilesProvider.setSearchQuery("");
		};
		vaultWatcher.onDidChange(refreshAll);
		vaultWatcher.onDidCreate(refreshAll);
		vaultWatcher.onDidDelete(refreshAll);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshFleets", () => {
				fleetsProvider.setSearchQuery("");
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.searchFleets", async () => {
				const query = await vscode.window.showInputBox({
					placeHolder: "Search Fleets...",
				});
				if (query !== undefined) fleetsProvider.setSearchQuery(query);
			}),
		);
		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.clearSearchFleets", () =>
				fleetsProvider.setSearchQuery(""),
			),
		);

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
