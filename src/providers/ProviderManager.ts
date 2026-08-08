import type * as vscode from "vscode";
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
		// Register Custom Editor Providers
		LogCustomEditorProvider.register(this.context);
		WorkflowPreviewEditorProvider.register(this.context);
		FleetPreviewEditorProvider.register(this.context);
		BrowserProfileEditorProvider.register(this.context);

		// --- TREE VIEWS --- //

		// 1. Active Runners Panel
		const runnersProvider = new RunnersTreeDataProvider();
		runnersProvider.register(this.context);

		// 1.5. Execution History Panel
		const historyProvider = new HistoryTreeDataProvider(this.context);
		historyProvider.register(this.context);

		// 2. Profiles Panel
		const profilesProvider = new AutomaFilesProvider(
			"**/*.{profile,bprofile}.json",
			"account",
			"automa.browserProfiles",
		);
		profilesProvider.register(this.context, "Profiles");

		// 3. Workflows Panel
		const workflowsProvider = new AutomaFilesProvider(
			"**/*.{workflow,package}.json",
			"file-code",
			"automa.workflows",
			"workflow",
		);
		workflowsProvider.register(this.context, "Workflows");

		// 4. Packages Panel
		const packagesProvider = new AutomaFilesProvider(
			"**/*.{workflow,package}.json",
			"package",
			"automa.packages",
			"package",
		);
		packagesProvider.register(this.context, "Packages");

		// 5. Fleets Panel
		const fleetsProvider = new AutomaFilesProvider(
			"**/*.{fleet,fleets}.json",
			"rocket",
			"automa.fleets",
		);
		fleetsProvider.register(this.context, "Fleets");

		// 6. Global Vault Panel
		const vaultProvider = new VaultTreeDataProvider();
		vaultProvider.register(this.context);
	}
}
