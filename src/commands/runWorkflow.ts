import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";
import {
	castRecord,
	extractFsPath,
	hasStringProp,
	isRecord,
	isString,
	toError,
} from "../utils/typeGuards";

let _automaOutputChannel: vscode.OutputChannel;

function getWorkspaceRoot(): string | undefined {
	if (
		vscode.workspace.workspaceFolders &&
		vscode.workspace.workspaceFolders.length > 0
	) {
		return vscode.workspace.workspaceFolders[0].uri.fsPath;
	}
	return undefined;
}

async function resolveTargets(
	nodeOrUri?: unknown,
	nodesOrUris?: unknown[],
): Promise<Array<{ targetPath: string; displayName: string }>> {
	const targets: Array<{ targetPath: string; displayName: string }> = [];

	if (Array.isArray(nodesOrUris) && nodesOrUris.length > 0) {
		for (const n of nodesOrUris) {
			const pathFromNode = extractFsPath(n);
			if (pathFromNode?.endsWith(".json")) {
				const displayName = hasStringProp(n, "label")
					? n.label
					: path.basename(pathFromNode);
				targets.push({ targetPath: pathFromNode, displayName });
			}
		}
	}

	if (targets.length === 0) {
		const pathFromNode = extractFsPath(nodeOrUri);
		if (pathFromNode) {
			if (pathFromNode.endsWith(".json")) {
				const displayName = hasStringProp(nodeOrUri, "label")
					? nodeOrUri.label
					: path.basename(pathFromNode);
				targets.push({ targetPath: pathFromNode, displayName });
			}
		} else {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor?.document.uri.fsPath.endsWith(".json")) {
				const targetPath = activeEditor.document.uri.fsPath;
				const displayName = path.basename(targetPath);
				targets.push({ targetPath, displayName });
			}
		}
	}

	if (targets.length === 0) {
		const uris = await vscode.window.showOpenDialog({
			canSelectMany: true,
			openLabel: "Select Workflow(s)",
			filters: {
				"JSON files": ["json"],
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

	if (targets.length === 0) {
		return [];
	}

	const validTargets: Array<{ targetPath: string; displayName: string }> = [];
	for (const t of targets) {
		try {
			fs.accessSync(t.targetPath, fs.constants.R_OK);
			validTargets.push(t);
		} catch (e: unknown) {
			vscode.window.showErrorMessage(
				`Failed to access workflow file: ${toError(e).message}`,
			);
		}
	}

	return validTargets;
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

	const vaultPath = getWorkspaceRoot();
	if (vaultPath) {
		args.push("--vault-path", vaultPath);
	}

	return args;
}

export async function runWorkflowCommand(
	nodeOrUri?: unknown,
	params?: unknown | Record<string, unknown> | unknown[],
	runOptions?: { keepBrowserOpen?: boolean },
) {
	let nodesOrUris: unknown[] | undefined;
	let parsedParams: Record<string, unknown> | undefined;

	if (Array.isArray(params)) {
		nodesOrUris = params;
	} else if (isRecord(params)) {
		parsedParams = castRecord(params);
	}

	const targets = await resolveTargets(nodeOrUri, nodesOrUris);
	if (targets.length === 0) return;

	const config = vscode.workspace.getConfiguration("automa");
	const keepBrowserOpen =
		runOptions?.keepBrowserOpen ??
		!config.get<boolean>("vault.run.closeBrowserOnFinish", true);

	const globalVariables = config.get<Record<string, string>>(
		"vault.run.globalVariables",
		{},
	);
	const mergedVariables = { ...globalVariables, ...(parsedParams || {}) };
	const hasMergedVariables = Object.keys(mergedVariables).length > 0;
	const useDefaultParameters = config.get<boolean>(
		"run.useDefaultParameters",
		false,
	);

	for (const target of targets) {
		const { targetPath, displayName } = target;
		const args = buildBaseArgs(targetPath, config, keepBrowserOpen);

		if (hasMergedVariables) {
			args.push("--variables", JSON.stringify(mergedVariables));
		}

		if (useDefaultParameters) {
			args.push("--use-default-parameters");
		}

		await TaskRunner.runAutomaCli(args, {
			id: `workflow-${Date.now()}-${Math.random().toString(36).substring(7)}`,
			name: `Workflow: ${displayName}`,
			source: "Automa",
			startMessage: `Running Workflow: ${displayName}`,
			successMessage: `Workflow finished: ${displayName}`,
			errorMessage: `Workflow failed: ${displayName}`,
			statusBarText: `Running: ${displayName}`,
			useTelemetry: false,
		});
	}
}

export async function runWorkflowWithParamsCommand(
	nodeOrUri?: unknown,
	nodesOrUris?: unknown[],
) {
	const targets = await resolveTargets(nodeOrUri, nodesOrUris);
	if (targets.length === 0) return;

	// Bỏ qua logic tự parse params bằng showInputBox vì CLI đã có wizard (prompts) rất tốt.
	// Chúng ta sẽ gọi thẳng CLI và KHÔNG truyền --use-default-parameters để ép nó hiện wizard trong Terminal.
	const config = vscode.workspace.getConfiguration("automa");
	const keepBrowserOpen = !config.get<boolean>(
		"vault.run.closeBrowserOnFinish",
		true,
	);
	const globalVariables = config.get<Record<string, string>>(
		"vault.run.globalVariables",
		{},
	);
	const hasGlobalVariables = Object.keys(globalVariables).length > 0;

	for (const target of targets) {
		const { targetPath, displayName } = target;
		const args = buildBaseArgs(targetPath, config, keepBrowserOpen);

		if (hasGlobalVariables) {
			args.push("--variables", JSON.stringify(globalVariables));
		}

		await TaskRunner.runAutomaCli(args, {
			id: `workflow-${Date.now()}-${Math.random().toString(36).substring(7)}`,
			name: `Workflow (Params): ${displayName}`,
			source: "Automa",
			startMessage: `Running Workflow with Params: ${displayName}`,
			successMessage: `Workflow finished: ${displayName}`,
			errorMessage: `Workflow failed: ${displayName}`,
			statusBarText: `Running (Params): ${displayName}`,
			useTelemetry: false,
		});
	}
}
