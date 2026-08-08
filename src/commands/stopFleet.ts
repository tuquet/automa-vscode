import * as path from "node:path";
import * as vscode from "vscode";
import { Logger } from "../core/Logger";
import { extractFsPath } from "../utils/typeGuards";

export const stopFleetCommand = async (
	nodeOrUri?: unknown,
	nodesOrUris?: unknown[],
) => {
	const executions = vscode.tasks.taskExecutions;
	const fleetExecutions = executions.filter((e) =>
		e.task.name.includes("Fleet"),
	);

	if (fleetExecutions.length === 0) {
		vscode.window.showWarningMessage("No active Fleet task found to stop.");
		return;
	}

	const targetsToStop: vscode.TaskExecution[] = [];

	if (Array.isArray(nodesOrUris) && nodesOrUris.length > 0) {
		for (const n of nodesOrUris) {
			const pathFromNode = extractFsPath(n);
			if (pathFromNode) {
				const displayName = path.basename(pathFromNode);
				const exec = fleetExecutions.find(
					(e) => e.task.name === `Fleet: ${displayName}`,
				);
				if (exec && !targetsToStop.includes(exec)) targetsToStop.push(exec);
			}
		}
	}

	if (targetsToStop.length === 0) {
		const targetPath = extractFsPath(nodeOrUri);
		if (targetPath) {
			const displayName = path.basename(targetPath);
			const exec = fleetExecutions.find(
				(e) => e.task.name === `Fleet: ${displayName}`,
			);
			if (exec) targetsToStop.push(exec);
		} else {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor?.document.uri.fsPath.match(/\.(fleet|fleets)\.json$/)) {
				const targetPath = activeEditor.document.uri.fsPath;
				const displayName = path.basename(targetPath);
				const exec = fleetExecutions.find(
					(e) => e.task.name === `Fleet: ${displayName}`,
				);
				if (exec) targetsToStop.push(exec);
			}
		}
	}

	if (targetsToStop.length === 0) {
		// Fallback for Command Palette
		const selected = await vscode.window.showQuickPick(
			fleetExecutions.map((e) => ({ label: e.task.name, execution: e })),
			{
				placeHolder: "Select active Fleet(s) to stop",
				canPickMany: true,
			},
		);

		if (!selected) return;

		if (selected.length > 0) {
			for (const item of selected) {
				targetsToStop.push(item.execution);
			}
		}
	}

	if (targetsToStop.length > 0) {
		for (const targetExecution of targetsToStop) {
			targetExecution.terminate();
			Logger.info(`Stopped Fleet task: ${targetExecution.task.name}`);
		}
		vscode.window.showInformationMessage(
			`Stopped ${targetsToStop.length} Fleet task(s).`,
		);
	} else {
		vscode.window.showErrorMessage("Failed to resolve Fleet(s) to stop.");
	}
};
