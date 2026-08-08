import * as vscode from "vscode";
import { LiveLogEditorProvider } from "../providers/LiveLogEditorProvider";
import { extractUri } from "../utils/typeGuards";

export function showWorkflowSourceCommand() {
	return async (nodeOrUri: unknown) => {
		let uri = extractUri(nodeOrUri);
		if (!uri) {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor?.document.uri.fsPath.endsWith(".json")) {
				uri = activeEditor.document.uri;
			}
		}

		if (!uri) {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: "Select Workflow Source",
				filters: { "JSON files": ["json"] },
			});
			if (uris && uris.length > 0) uri = uris[0];
		}

		if (uri) {
			await vscode.workspace
				.getConfiguration("automa")
				.update(
					"preview.defaultOnClick",
					false,
					vscode.ConfigurationTarget.Global,
				);
			await vscode.commands.executeCommand("vscode.openWith", uri, "default");
		}
	};
}

export function showWorkflowPreviewCommand() {
	return async (nodeOrUri: unknown) => {
		let uri = extractUri(nodeOrUri);
		if (!uri) {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor?.document.uri.fsPath.endsWith(".json")) {
				uri = activeEditor.document.uri;
			}
		}

		if (!uri) {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: "Select Workflow to Preview",
				filters: { "JSON files": ["json"] },
			});
			if (uris && uris.length > 0) uri = uris[0];
		}

		if (uri) {
			await vscode.workspace
				.getConfiguration("automa")
				.update(
					"preview.defaultOnClick",
					true,
					vscode.ConfigurationTarget.Global,
				);
			await vscode.commands.executeCommand(
				"vscode.openWith",
				uri,
				"automa.workflowPreview",
			);
		}
	};
}

export function showFleetSourceCommand() {
	return async (nodeOrUri: unknown) => {
		let uri = extractUri(nodeOrUri);
		if (!uri) {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor?.document.uri.fsPath.match(/\.(fleet|fleets)\.json$/)) {
				uri = activeEditor.document.uri;
			}
		}

		if (!uri) {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: "Select Fleet Source",
				filters: {
					"Fleet files": ["fleet.json", "fleets.json"],
					"JSON files": ["json"],
				},
			});
			if (uris && uris.length > 0) uri = uris[0];
		}

		if (uri) {
			await vscode.commands.executeCommand("vscode.openWith", uri, "default");
		}
	};
}

export function showFleetPreviewCommand() {
	return async (nodeOrUri: unknown) => {
		let uri = extractUri(nodeOrUri);
		if (!uri) {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor?.document.uri.fsPath.match(/\.(fleet|fleets)\.json$/)) {
				uri = activeEditor.document.uri;
			}
		}

		if (!uri) {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: "Select Fleet to Preview",
				filters: {
					"Fleet files": ["fleet.json", "fleets.json"],
					"JSON files": ["json"],
				},
			});
			if (uris && uris.length > 0) uri = uris[0];
		}

		if (uri) {
			await vscode.commands.executeCommand(
				"vscode.openWith",
				uri,
				"automa.fleetPreview",
			);
		}
	};
}

export function showLogSourceCommand() {
	return async (nodeOrUri: unknown) => {
		let uri = extractUri(nodeOrUri);
		if (!uri) {
			const activeEditor = vscode.window.activeTextEditor;
			if (
				activeEditor?.document.uri.scheme === "automa-log" ||
				activeEditor?.document.uri.fsPath.endsWith(".json")
			) {
				uri = activeEditor.document.uri;
			}
		}

		if (uri) {
			await vscode.commands.executeCommand("vscode.openWith", uri, "default");
		} else {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: "Select Log Source",
				filters: { "Log files": ["automa-log.json"], "JSON files": ["json"] },
			});
			if (uris && uris.length > 0) {
				await vscode.commands.executeCommand(
					"vscode.openWith",
					uris[0],
					"default",
				);
			} else {
				await vscode.commands.executeCommand(
					"workbench.action.reopenTextEditor",
				);
			}
		}
	};
}

export function showLogPreviewCommand(context: vscode.ExtensionContext) {
	return async (nodeOrUri: unknown) => {
		let uri = extractUri(nodeOrUri);
		if (!uri) {
			const activeEditor = vscode.window.activeTextEditor;
			if (
				activeEditor?.document.uri.scheme === "automa-log" ||
				activeEditor?.document.uri.fsPath.endsWith(".json")
			) {
				uri = activeEditor.document.uri;
			}
		}

		if (uri && uri.scheme === "automa-log") {
			const jobId = uri.authority || uri.path.replace(/^\//, "");
			const {
				LogCustomEditorProvider,
			} = require("../providers/LogCustomEditorProvider");
			await LogCustomEditorProvider.showLogForJobId(context, jobId);
		} else if (uri) {
			await vscode.commands.executeCommand(
				"vscode.openWith",
				uri,
				"automa.logEditor",
			);
		} else {
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: "Select Log to Preview",
				filters: { "Log files": ["automa-log.json"], "JSON files": ["json"] },
			});
			if (uris && uris.length > 0) {
				await vscode.commands.executeCommand(
					"vscode.openWith",
					uris[0],
					"automa.logEditor",
				);
			}
		}
	};
}

export function showLiveLogCommand(context: vscode.ExtensionContext) {
	return async (execution?: vscode.TaskExecution) => {
		if (!execution) {
			const runners = vscode.tasks.taskExecutions.filter((e) =>
				e.task.source?.startsWith("Automa"),
			);
			if (runners.length === 0) {
				vscode.window.showInformationMessage(
					"No active runners to show live log for.",
				);
				return;
			}
			const selected = await vscode.window.showQuickPick(
				runners.map((r) => ({ label: r.task.name, execution: r })),
				{ placeHolder: "Select a running task to view live log" },
			);
			if (!selected) return;
			execution = selected.execution;
		}

		if (execution) {
			const taskId = execution.task.definition.id || execution.task.name;
			LiveLogEditorProvider.showLiveLog(context, taskId, execution.task.name);
		}
	};
}
