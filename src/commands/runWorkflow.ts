import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";
import { extractFsPath, isString, toError } from "../utils/typeGuards";

let _automaOutputChannel: vscode.OutputChannel;

async function resolveTarget(
	nodeOrUri?: unknown,
): Promise<{ targetPath: string; displayName: string } | null> {
	let targetPath = "";
	let displayName = "";

	const pathFromNode = extractFsPath(nodeOrUri);
	if (pathFromNode) {
		targetPath = pathFromNode;
		displayName =
			typeof (nodeOrUri as Record<string, unknown>).label === "string"
				? (nodeOrUri as { label: string }).label
				: path.basename(targetPath);
	} else {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor?.document.uri.fsPath.endsWith(".json")) {
			targetPath = activeEditor.document.uri.fsPath;
			displayName = path.basename(targetPath);
		}
	}

	if (!targetPath) {
		const uris = await vscode.window.showOpenDialog({
			canSelectMany: false,
			openLabel: "Select Workflow",
			filters: {
				"JSON files": ["json"],
			},
		});
		if (!uris || uris.length === 0) return null;

		targetPath = uris[0].fsPath;
		displayName = path.basename(targetPath);
	}

	if (!targetPath.endsWith(".json")) {
		vscode.window.showErrorMessage(
			"Invalid file type. Only local JSON workflows (.json) are supported.",
		);
		return null;
	}

	try {
		// Just to validate it's readable
		fs.accessSync(targetPath, fs.constants.R_OK);
	} catch (e: unknown) {
		vscode.window.showErrorMessage(
			`Failed to access workflow file: ${toError(e).message}`,
		);
		return null;
	}

	return { targetPath, displayName };
}

function buildBaseArgs(
	targetPath: string,
	config: vscode.WorkspaceConfiguration,
	keepBrowserOpen: boolean,
): string[] {
	const args: string[] = ["run", targetPath];

	const configMappings = [
		{ key: "vault.run.headless", flag: "--headless", type: "boolean" },
		{ key: "vault.run.debug", flag: "--debug", type: "boolean" },
		{
			key: "vault.run.defaultBrowser",
			flag: "--default-browser",
			type: "string",
		},
	];

	for (const mapping of configMappings) {
		const val = config.get(mapping.key);
		if (mapping.type === "boolean" && val) {
			args.push(mapping.flag);
		} else if (
			mapping.type === "string" &&
			isString(val) &&
			val.trim() !== ""
		) {
			args.push(mapping.flag, val);
		}
	}

	if (keepBrowserOpen) {
		args.push("--keep-browser-open");
	}

	return args;
}

export async function runWorkflowCommand(
	nodeOrUri?: unknown,
	params?: Record<string, unknown>,
	runOptions?: { keepBrowserOpen?: boolean },
) {
	const target = await resolveTarget(nodeOrUri);
	if (!target) return;
	const { targetPath, displayName } = target;

	const config = vscode.workspace.getConfiguration("automa");
	const keepBrowserOpen =
		runOptions?.keepBrowserOpen ??
		!config.get<boolean>("vault.run.closeBrowserOnFinish", true);

	const args = buildBaseArgs(targetPath, config, keepBrowserOpen);

	const globalVariables = config.get<Record<string, string>>(
		"vault.run.globalVariables",
		{},
	);
	const mergedVariables = { ...globalVariables, ...(params || {}) };

	if (Object.keys(mergedVariables).length > 0) {
		args.push("--variables", JSON.stringify(mergedVariables));
	}

	if (config.get<boolean>("run.useDefaultParameters", false)) {
		args.push("--use-default-parameters");
	}

	await TaskRunner.runAutomaCli(args, {
		id: `workflow-${Date.now()}`,
		name: `Workflow: ${displayName}`,
		source: "Automa",
		startMessage: `Running Workflow: ${displayName}`,
		successMessage: `Workflow finished: ${displayName}`,
		errorMessage: `Workflow failed: ${displayName}`,
		statusBarText: `Running: ${displayName}`,
		useTelemetry: false,
	});
}

export async function runWorkflowWithParamsCommand(nodeOrUri?: unknown) {
	const target = await resolveTarget(nodeOrUri);
	if (!target) return;
	const { targetPath, displayName } = target;

	// Bỏ qua logic tự parse params bằng showInputBox vì CLI đã có wizard (prompts) rất tốt.
	// Chúng ta sẽ gọi thẳng CLI và KHÔNG truyền --use-default-parameters để ép nó hiện wizard trong Terminal.
	const config = vscode.workspace.getConfiguration("automa");
	const keepBrowserOpen = !config.get<boolean>(
		"vault.run.closeBrowserOnFinish",
		true,
	);

	const args = buildBaseArgs(targetPath, config, keepBrowserOpen);

	const globalVariables = config.get<Record<string, string>>(
		"vault.run.globalVariables",
		{},
	);
	if (Object.keys(globalVariables).length > 0) {
		args.push("--variables", JSON.stringify(globalVariables));
	}

	await TaskRunner.runAutomaCli(args, {
		id: `workflow-${Date.now()}`,
		name: `Workflow (Params): ${displayName}`,
		source: "Automa",
		startMessage: `Running Workflow with Params: ${displayName}`,
		successMessage: `Workflow finished: ${displayName}`,
		errorMessage: `Workflow failed: ${displayName}`,
		statusBarText: `Running (Params): ${displayName}`,
		useTelemetry: false,
	});
}
