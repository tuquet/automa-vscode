import * as vscode from "vscode";
import type { HistoryTreeProvider } from "../providers/HistoryTreeProvider";
import { previewWorkflowCommand } from "./previewWorkflow";
import { refreshHistoryCommand } from "./refreshHistory";
import { filterHistoryCommand } from "./filterHistory";
import { runWorkflowCommand } from "./runWorkflow";
import { viewLogCommand } from "./viewLog";

export function registerCommands(
	context: vscode.ExtensionContext,
	historyProvider: HistoryTreeProvider,
) {
	const commands = [
		vscode.commands.registerCommand(
			"automa.previewWorkflow",
			previewWorkflowCommand(context),
		),
		vscode.commands.registerCommand("automa.runWorkflow", runWorkflowCommand),
		vscode.commands.registerCommand("automa.refreshHistory", () =>
			refreshHistoryCommand(historyProvider),
		),
		vscode.commands.registerCommand("automa.filterHistory", () =>
			filterHistoryCommand(historyProvider),
		),
		vscode.commands.registerCommand("automa.viewLog", viewLogCommand),
	];

	context.subscriptions.push(...commands);
}
