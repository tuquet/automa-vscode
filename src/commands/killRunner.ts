import * as vscode from "vscode";
import { toError } from "../utils/typeGuards";

export async function killRunner(execution?: vscode.TaskExecution) {
	if (!execution) {
		const runners = vscode.tasks.taskExecutions.filter((e) =>
			e.task.source?.startsWith("Automa"),
		);
		if (runners.length === 0) {
			vscode.window.showInformationMessage("No active runners to kill.");
			return;
		}
		const selected = await vscode.window.showQuickPick(
			runners.map((r) => ({ label: r.task.name, execution: r })),
			{ placeHolder: "Select a running task to kill" },
		);
		if (!selected) return;
		execution = selected.execution;
	}

	if (!execution) {
		vscode.window.showErrorMessage("No runner selected to kill.");
		return;
	}

	try {
		execution.terminate();
		vscode.window.showInformationMessage(
			`Stopped runner: ${execution.task.name}`,
		);
	} catch (error: unknown) {
		const e = toError(error);
		vscode.window.showErrorMessage(`Failed to stop runner: ${e.message}`);
	}
}
