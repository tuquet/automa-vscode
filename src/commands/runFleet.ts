import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";

export async function runFleetCommand(
	nodeOrUri?: vscode.Uri | { fsPath: string },
) {
	let targetPath = "";
	let displayName = "";

	if (nodeOrUri?.fsPath) {
		targetPath = nodeOrUri.fsPath;
		displayName = path.basename(nodeOrUri.fsPath);
	} else {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor?.document.uri.fsPath.endsWith(".fleets.json")) {
			targetPath = activeEditor.document.uri.fsPath;
			displayName = path.basename(targetPath);
		} else {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: "Select Fleet",
				filters: {
					"Fleet files": ["fleets.json"],
				},
			});
			if (!uris || uris.length === 0) return;
			targetPath = uris[0].fsPath;
			displayName = path.basename(targetPath);
		}
	}

	const options = await vscode.window.showQuickPick(
		[
			{
				label: "$(play) Run Now",
				description: "Run all tasks immediately (ignore schedules)",
			},
			{
				label: "$(clock) Start Daemon",
				description:
					"Start the fleet in background and wait for cron schedules",
			},
		],
		{ placeHolder: "How do you want to run this fleet?" },
	);

	if (!options) return;
	const isRunNow = options.label.includes("Run Now");

	const args: string[] = ["fleet", "start", targetPath];

	if (isRunNow) {
		args.push("--run-now");
	}

	const config = vscode.workspace.getConfiguration("automa");
	const gridSystem = config.get<boolean>("vault.run.fleetGridSystem", true);
	if (gridSystem) {
		args.push("--grid");
	}

	await TaskRunner.runAutomaCli(args, {
		id: `fleet-orchestrator-${Date.now()}`,
		name: `Fleet: ${displayName}`,
		source: "Automa",
		startMessage: `Starting Fleet Orchestrator: ${displayName}`,
		successMessage: `Fleet Orchestrator finished: ${displayName}`,
		errorMessage: `Fleet Orchestrator exited with error`,
		statusBarText: `Fleet Orchestrator: ${displayName}`,
		useTelemetry: true,
	});
}
