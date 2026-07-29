import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { TerminalManager } from "./core/TerminalManager";
import { LogCustomEditorProvider } from "./providers/LogCustomEditorProvider";
import { WorkflowPreviewEditorProvider } from "./providers/WorkflowPreviewEditorProvider";

export function activate(context: vscode.ExtensionContext) {
	console.log("Automa VS Code Extension is now active!");

	// Initialize Output Channel (managed by TerminalManager)
	const logOutputChannel = TerminalManager.getOutputChannel();
	context.subscriptions.push(logOutputChannel);

	// Register Custom Editor Provider for .automa-log.json
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			LogCustomEditorProvider.viewType,
			new LogCustomEditorProvider(context),
			{
				webviewOptions: {
					retainContextWhenHidden: true,
				},
				supportsMultipleEditorsPerDocument: false,
			}
		)
	);

	// Register Custom Editor Provider for .automa.json
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			WorkflowPreviewEditorProvider.viewType,
			new WorkflowPreviewEditorProvider(context),
			{
				webviewOptions: {
					retainContextWhenHidden: true,
				},
				supportsMultipleEditorsPerDocument: false,
			}
		)
	);

	// Sync automa.preview.defaultOnClick with workbench.editorAssociations
	const syncPreviewSetting = () => {
		const config = vscode.workspace.getConfiguration("automa");
		const defaultOnClick = config.get<boolean>("preview.defaultOnClick", true);
		
		const workbenchConfig = vscode.workspace.getConfiguration("workbench");
		let editorAssociations: Record<string, string> = workbenchConfig.get("editorAssociations") || {};
		
		const currentAssoc = editorAssociations["*.automa.json"];
		let updated = false;

		if (defaultOnClick && currentAssoc !== "automa.workflowPreview") {
			editorAssociations["*.automa.json"] = "automa.workflowPreview";
			updated = true;
		} else if (!defaultOnClick && currentAssoc === "automa.workflowPreview") {
			editorAssociations["*.automa.json"] = "default";
			updated = true;
		}

		if (updated) {
			workbenchConfig.update("editorAssociations", editorAssociations, vscode.ConfigurationTarget.Global);
		}
	};

	// Initial sync
	syncPreviewSetting();

	// Listen for setting changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration("automa.preview.defaultOnClick")) {
				syncPreviewSetting();
			}
		})
	);

	// Register all commands
	registerCommands(context);
}

export function deactivate() {
	TerminalManager.dispose();
}
