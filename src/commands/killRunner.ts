import * as vscode from "vscode";

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
		const e = error instanceof Error ? error : new Error(String(error));
		vscode.window.showErrorMessage(`Failed to stop runner: ${e.message}`);
	}
}
