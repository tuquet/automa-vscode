import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";
import { extractFsPath } from "../utils/typeGuards";

export async function runFleetCommand(
	nodeOrUri?: unknown,
	nodesOrUris?: unknown[],
) {
	const targets: Array<{ targetPath: string; displayName: string }> = [];

	if (Array.isArray(nodesOrUris) && nodesOrUris.length > 0) {
		for (const n of nodesOrUris) {
			const pathFromNode = extractFsPath(n);
			if (pathFromNode?.match(/\.(fleet|fleets)\.json$/)) {
				const displayName = path.basename(pathFromNode);
				targets.push({ targetPath: pathFromNode, displayName });
			}
		}
	}

	if (targets.length === 0) {
		const pathFromNode = extractFsPath(nodeOrUri);
		if (pathFromNode) {
			if (pathFromNode.match(/\.(fleet|fleets)\.json$/)) {
				const displayName = path.basename(pathFromNode);
				targets.push({ targetPath: pathFromNode, displayName });
			}
		} else {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor?.document.uri.fsPath.match(/\.(fleet|fleets)\.json$/)) {
				const targetPath = activeEditor.document.uri.fsPath;
				const displayName = path.basename(targetPath);
				targets.push({ targetPath, displayName });
			}
		}
	}

	if (targets.length === 0) {
		const uris = await vscode.window.showOpenDialog({
			canSelectMany: true,
			openLabel: "Select Fleet(s)",
			filters: {
				"Fleet files": ["fleet.json", "fleets.json"],
			},
		});
		if (uris && uris.length > 0) {
			for (const uri of uris) {
				targets.push({
					targetPath: uri.fsPath,
					displayName: path.basename(uri.fsPath),
				});
			}
		}
	}

	if (targets.length === 0) return;

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
		{ placeHolder: "How do you want to run the selected fleet(s)?" },
	);

	if (!options) return;
	const isRunNow = options.label.includes("Run Now");
	const config = vscode.workspace.getConfiguration("automa");
	const gridSystem = config.get<boolean>("vault.run.fleetGridSystem", true);

	for (const target of targets) {
		const { targetPath, displayName } = target;
		const args: string[] = ["fleet", "start", targetPath];

		if (isRunNow) {
			args.push("--run-now");
		}
		if (gridSystem) {
			args.push("--grid");
		}

		await TaskRunner.runAutomaCli(args, {
			id: `fleet-orchestrator-${Date.now()}-${Math.random().toString(36).substring(7)}`,
			name: `Fleet: ${displayName}`,
			source: "Automa",
			startMessage: `Starting Fleet Orchestrator: ${displayName}`,
			successMessage: `Fleet Orchestrator finished: ${displayName}`,
			errorMessage: `Fleet Orchestrator exited with error`,
			statusBarText: `Fleet Orchestrator: ${displayName}`,
			useTelemetry: true,
		});
	}
}
