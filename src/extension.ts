import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { TerminalManager } from "./core/TerminalManager";
import { HistoryTreeProvider } from "./providers/HistoryTreeProvider";

export function activate(context: vscode.ExtensionContext) {
	console.log("Automa VS Code Extension is now active!");

	// Initialize Output Channel (managed by TerminalManager)
	const logOutputChannel = TerminalManager.getOutputChannel();
	context.subscriptions.push(logOutputChannel);

	// Initialize Tree View
	const historyProvider = new HistoryTreeProvider();
	vscode.window.registerTreeDataProvider("automa.historyView", historyProvider);

	// Register all commands
	registerCommands(context, historyProvider);
}

export function deactivate() {
	TerminalManager.dispose();
}
