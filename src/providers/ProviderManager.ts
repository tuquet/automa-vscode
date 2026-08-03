import * as vscode from "vscode";
import { LogCustomEditorProvider } from "./LogCustomEditorProvider";
import { WorkflowPreviewEditorProvider } from "./WorkflowPreviewEditorProvider";
import { FleetPreviewEditorProvider } from "./FleetPreviewEditorProvider";
import { RunnersTreeDataProvider } from "./RunnersTreeDataProvider";

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

		// Register Custom Editor Provider for .automa.json
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

		// Register Custom Editor Provider for .fleets.json
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

		// Register Tree Data Provider for Active Runners Panel
		const runnersProvider = new RunnersTreeDataProvider();
		
		const treeView = vscode.window.createTreeView("automa.activeRunners", { 
			treeDataProvider: runnersProvider 
		});
		
		// Inject tree view back into provider to support badge updates
		runnersProvider.setTreeView(treeView);
		
		this.context.subscriptions.push(treeView);

		this.context.subscriptions.push(
			vscode.commands.registerCommand("automa.refreshRunners", () => {
				runnersProvider.refresh();
			})
		);
		
		// Perform an initial refresh to set the initial badge if runners already exist
		runnersProvider.refresh();
	}
}
