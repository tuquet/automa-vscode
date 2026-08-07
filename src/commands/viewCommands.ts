import * as vscode from "vscode";
import { LiveLogEditorProvider } from "../providers/LiveLogEditorProvider";

export function showWorkflowSourceCommand() {
	return async (nodeOrUri: unknown) => {
		let uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
		if (!uri) uri = vscode.window.activeTextEditor?.document.uri;

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
		let uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
		if (!uri) uri = vscode.window.activeTextEditor?.document.uri;

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
		let uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
		if (!uri) uri = vscode.window.activeTextEditor?.document.uri;

		if (uri) {
			await vscode.commands.executeCommand("vscode.openWith", uri, "default");
		}
	};
}

export function showFleetPreviewCommand() {
	return async (nodeOrUri: unknown) => {
		let uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
		if (!uri) uri = vscode.window.activeTextEditor?.document.uri;

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
		let uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
		if (!uri) uri = vscode.window.activeTextEditor?.document.uri;

		if (uri) {
			await vscode.commands.executeCommand("vscode.openWith", uri, "default");
		} else {
			await vscode.commands.executeCommand("workbench.action.reopenTextEditor");
		}
	};
}

export function showLogPreviewCommand(context: vscode.ExtensionContext) {
	return async (nodeOrUri: unknown) => {
		let uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
		if (!uri) uri = vscode.window.activeTextEditor?.document.uri;

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
