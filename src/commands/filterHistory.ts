import * as vscode from "vscode";
import type { HistoryTreeProvider } from "../providers/HistoryTreeProvider";

export async function filterHistoryCommand(provider: HistoryTreeProvider) {
	const items = [
		{ label: "$(list-unordered) All", description: "Show all jobs", value: "all" },
		{ label: "$(pass-filled) Completed", description: "Show only completed jobs", value: "completed" },
		{ label: "$(error) Failed", description: "Show only failed jobs", value: "failed" },
		{ label: "$(play-circle) Active", description: "Show only active jobs", value: "active" },
	];

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: "Filter Execution History by Status",
	});

	if (selected) {
		provider.setFilter(selected.value);
	}
}
