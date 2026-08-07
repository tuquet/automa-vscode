import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";

let _automaOutputChannel: vscode.OutputChannel;

async function resolveTarget(
	nodeOrUri?: unknown,
): Promise<{ targetPath: string; displayName: string } | null> {
	let targetPath = "";
	let displayName = "";

	if (nodeOrUri instanceof vscode.Uri) {
		targetPath = nodeOrUri.fsPath;
		displayName = path.basename(nodeOrUri.fsPath);
	} else if (nodeOrUri && typeof nodeOrUri === "object") {
		const node = nodeOrUri as Record<string, unknown>;
		if ("fsPath" in node && typeof node.fsPath === "string") {
			targetPath = node.fsPath;
			displayName = path.basename(node.fsPath);
		} else if ("fullPath" in node && typeof node.fullPath === "string") {
			targetPath = node.fullPath;
			displayName =
				typeof node.label === "string" ? node.label : path.basename(targetPath);
		}
	}

	if (!targetPath) {
		const input = await vscode.window.showInputBox({
			prompt: "Enter absolute path to workflow JSON",
			placeHolder: "e.g. C:\\path\\to\\workflow.json",
		});
		if (!input) return null;

		targetPath = input;
		displayName = input;
	}

	if (!targetPath.endsWith(".json")) {
		vscode.window.showErrorMessage(
			"Cloud workflows are not supported yet via API.",
		);
		return null;
	}

	try {
		// Just to validate it's readable
		fs.accessSync(targetPath, fs.constants.R_OK);
	} catch (e: unknown) {
		vscode.window.showErrorMessage(
			`Failed to access workflow file: ${(e as Error).message}`,
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
			typeof val === "string" &&
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
