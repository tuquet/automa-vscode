import * as path from "node:path";
import * as vscode from "vscode";
import { Logger } from "../core/Logger";
import { extractFsPath } from "../utils/typeGuards";

export const stopFleetCommand = async (nodeOrUri?: unknown) => {
	const executions = vscode.tasks.taskExecutions;
	const fleetExecutions = executions.filter((e) =>
		e.task.name.includes("Fleet"),
	);

	if (fleetExecutions.length === 0) {
		vscode.window.showWarningMessage("No active Fleet task found to stop.");
		return;
	}

	let targetExecution: vscode.TaskExecution | undefined;
	let targetPath = extractFsPath(nodeOrUri);

	if (targetPath) {
		const displayName = path.basename(targetPath);
		targetExecution = fleetExecutions.find(
			(e) => e.task.name === `Fleet: ${displayName}`,
		);
	} else {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor?.document.uri.fsPath.match(/\\.(fleet|fleets)\\.json$/)) {
			targetPath = activeEditor.document.uri.fsPath;
			const displayName = path.basename(targetPath);
			targetExecution = fleetExecutions.find(
				(e) => e.task.name === `Fleet: ${displayName}`,
			);
		}
	}

	if (!targetExecution) {
		// Fallback for Command Palette
		const selected = await vscode.window.showQuickPick(
			fleetExecutions.map((e) => ({ label: e.task.name, execution: e })),
			{ placeHolder: "Select an active Fleet to stop" },
		);
		if (!selected) return;
		targetExecution = selected.execution;
	}

	if (targetExecution) {
		targetExecution.terminate();
		Logger.info(`Stopped Fleet task: ${targetExecution.task.name}`);
		vscode.window.showInformationMessage(
			`Stopped ${targetExecution.task.name}.`,
		);
	} else {
		vscode.window.showErrorMessage("Failed to resolve Fleet to stop.");
	}
};
