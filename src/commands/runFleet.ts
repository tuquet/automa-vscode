import * as vscode from "vscode";
import * as path from "node:path";
import { TaskRunner } from "../core/TaskRunner";

export async function runFleetCommand(nodeOrUri?: any) {
	let targetPath = "";
	let displayName = "";

	if (nodeOrUri?.fsPath) {
		targetPath = nodeOrUri.fsPath;
		displayName = path.basename(nodeOrUri.fsPath);
	} else {
		vscode.window.showErrorMessage("Run Fleet must be triggered from a .fleets.json file.");
		return;
	}

	const options = await vscode.window.showQuickPick([
		{ label: "$(play) Run Now", description: "Run all tasks immediately (ignore schedules)" },
		{ label: "$(clock) Start Daemon", description: "Start the fleet in background and wait for cron schedules" }
	], { placeHolder: "How do you want to run this fleet?" });

	if (!options) return;
	const isRunNow = options.label.includes("Run Now");

	const args = ["automa", "fleet", "start", targetPath];
	if (isRunNow) {
		args.push("--run-now");
	}

	TaskRunner.run({
		id: `fleet-orchestrator-${Date.now()}`,
		name: `Fleet: ${displayName}`,
		args: args,
		startMessage: `Starting Fleet Orchestrator: ${displayName}`,
		successMessage: `Fleet Orchestrator finished: ${displayName}`,
		errorMessage: `Fleet Orchestrator exited with error`,
		statusBarText: `Fleet Orchestrator: ${displayName}`
	});
}
