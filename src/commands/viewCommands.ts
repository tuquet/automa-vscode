import * as vscode from "vscode";
import { LiveLogEditorProvider } from "../providers/LiveLogEditorProvider";

export function showWorkflowSourceCommand() {
	return async (nodeOrUri: unknown) => {
		const uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
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
		const uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
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
		const uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
		if (uri) {
			await vscode.commands.executeCommand("vscode.openWith", uri, "default");
		}
	};
}

export function showFleetPreviewCommand() {
	return async (nodeOrUri: unknown) => {
		const uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
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
		const uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
		if (uri) {
			await vscode.commands.executeCommand("vscode.openWith", uri, "default");
		} else {
			await vscode.commands.executeCommand("workbench.action.reopenTextEditor");
		}
	};
}

export function showLogPreviewCommand(context: vscode.ExtensionContext) {
	return async (nodeOrUri: unknown) => {
		const uri =
			nodeOrUri instanceof vscode.Uri
				? nodeOrUri
				: (nodeOrUri as { resourceUri?: vscode.Uri })?.resourceUri;
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
	return (execution: vscode.TaskExecution) => {
		if (execution) {
			const taskId = execution.task.definition.id || execution.task.name;
			LiveLogEditorProvider.showLiveLog(context, taskId, execution.task.name);
		}
	};
}
