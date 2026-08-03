import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
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

	const isWin = process.platform === "win32";
	let cmd = isWin ? "npx.cmd" : "npx";
	let args = ["-y", "tuquet-automa-cli@latest", "fleet", "start", targetPath];

	const config = vscode.workspace.getConfiguration("automa");
	const userCliPath = config.get<string>("cliPath");
	if (userCliPath && fs.existsSync(userCliPath)) {
		cmd = "node";
		args = [userCliPath, "fleet", "start", targetPath];
	} else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
		const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const localCliPath = path.join(workspaceRoot, "..", "automa-cli", "dist", "cli.js");
		if (fs.existsSync(localCliPath)) {
			cmd = "node";
			args = [localCliPath, "fleet", "start", targetPath];
		}
	}

	if (isRunNow) {
		args.push("--run-now");
	}

	TaskRunner.runWithTelemetry({
		id: `fleet-orchestrator-${Date.now()}`,
		name: `Fleet: ${displayName}`,
		command: cmd,
		args: args,
		startMessage: `Starting Fleet Orchestrator: ${displayName}`,
		successMessage: `Fleet Orchestrator finished: ${displayName}`,
		errorMessage: `Fleet Orchestrator exited with error`,
		statusBarText: `Fleet Orchestrator: ${displayName}`
	});
}
