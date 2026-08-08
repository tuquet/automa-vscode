import * as vscode from "vscode";
import { toError } from "../utils/typeGuards";

export async function killRunner(
	execution?: vscode.TaskExecution,
	selectedExecutions?: vscode.TaskExecution[],
) {
	let targetsToStop: vscode.TaskExecution[] = [];

	if (Array.isArray(selectedExecutions) && selectedExecutions.length > 0) {
		targetsToStop = [...selectedExecutions];
	} else if (execution) {
		targetsToStop = [execution];
	} else {
		const runners = vscode.tasks.taskExecutions.filter((e) =>
			e.task.source?.startsWith("Automa"),
		);
		if (runners.length === 0) {
			vscode.window.showInformationMessage("No active runners to kill.");
			return;
		}
		const selected = await vscode.window.showQuickPick(
			runners.map((r) => ({ label: r.task.name, execution: r })),
			{
				placeHolder: "Select active runner(s) to kill",
				canPickMany: true,
			},
		);
		if (!selected || selected.length === 0) return;
		targetsToStop = selected.map((s) => s.execution);
	}

	if (targetsToStop.length === 0) {
		vscode.window.showErrorMessage("No runner selected to kill.");
		return;
	}

	let successCount = 0;
	for (const exec of targetsToStop) {
		try {
			exec.terminate();
			successCount++;
		} catch (error: unknown) {
			const e = toError(error);
			vscode.window.showErrorMessage(
				`Failed to stop runner ${exec.task.name}: ${e.message}`,
			);
		}
	}

	if (successCount > 0) {
		vscode.window.showInformationMessage(`Stopped ${successCount} runner(s).`);
	}
}
