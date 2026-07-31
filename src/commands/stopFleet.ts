import * as vscode from "vscode";
import { Logger } from "../core/Logger";

export const stopFleetCommand = async (uri: vscode.Uri) => {
	const executions = vscode.tasks.taskExecutions;
	let stopped = 0;
	for (const execution of executions) {
		if (execution.task.name.includes("Fleet")) {
			execution.terminate();
			stopped++;
		}
	}
	
	if (stopped > 0) {
		Logger.info(`Stopped ${stopped} Fleet task(s).`);
		vscode.window.showInformationMessage(`Stopped ${stopped} active Fleet(s).`);
	} else {
		vscode.window.showWarningMessage("No active Fleet task found to stop.");
	}
};
