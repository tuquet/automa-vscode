import * as vscode from "vscode";
import { toError } from "../utils/typeGuards";

export async function killRunner(execution: vscode.TaskExecution) {
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
