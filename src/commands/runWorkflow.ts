import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";

let automaOutputChannel: vscode.OutputChannel;

export async function runWorkflowCommand(
	nodeOrUri?: any,
	params?: any,
	runOptions?: { keepBrowserOpen?: boolean },
) {
	let targetPath = "";
	let displayName = "";
	let workflowData: any = null;

	if (nodeOrUri?.fsPath) {
		targetPath = nodeOrUri.fsPath;
		displayName = path.basename(nodeOrUri.fsPath);
	} else if (nodeOrUri?.fullPath) {
		targetPath = nodeOrUri.fullPath;
		displayName = nodeOrUri.label;
	} else {
		const input = await vscode.window.showInputBox({
			prompt: "Enter absolute path to workflow JSON",
			placeHolder: "e.g. C:\\path\\to\\workflow.json",
		});
		if (!input) return;

		targetPath = input;
		displayName = input;
	}

	if (!targetPath.endsWith(".json")) {
		vscode.window.showErrorMessage(
			"Cloud workflows are not supported yet via API.",
		);
		return;
	}

	try {
		const fileContent = fs.readFileSync(targetPath, "utf-8");
		workflowData = JSON.parse(fileContent);
	} catch (e: any) {
		vscode.window.showErrorMessage(
			`Failed to read workflow file: ${e.message}`,
		);
		return;
	}

	const config = vscode.workspace.getConfiguration("automa");

	const keepBrowserOpen =
		runOptions?.keepBrowserOpen ??
		!config.get<boolean>("vault.run.closeBrowserOnFinish", true);

	const options: any = {
		variables: params ? params : undefined,
	};

	const args: string[] = ["run", targetPath];

	if (params && Object.keys(params).length > 0) {
		args.push("--variables", JSON.stringify(params));
	}

	const configMappings = [
		{
			key: "run.useDefaultParameters",
			flag: "--use-default-parameters",
			type: "boolean",
		},
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

	TaskRunner.runAutomaCli(args, {
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

export async function runWorkflowWithParamsCommand(nodeOrUri?: any) {
	let targetPath = "";
	let displayName = "";

	if (nodeOrUri?.fsPath) {
		targetPath = nodeOrUri.fsPath;
		displayName = path.basename(nodeOrUri.fsPath);
	} else if (nodeOrUri?.fullPath) {
		targetPath = nodeOrUri.fullPath;
		displayName = nodeOrUri.label;
	} else {
		const input = await vscode.window.showInputBox({
			prompt: "Enter absolute path to workflow JSON",
			placeHolder: "e.g. C:\\path\\to\\workflow.json",
		});
		if (!input) return;

		targetPath = input;
		displayName = input;
	}

	if (!targetPath.endsWith(".json")) {
		vscode.window.showErrorMessage(
			"Cloud workflows are not supported yet via API.",
		);
		return;
	}

	let workflowData: any = null;
	try {
		const fileContent = fs.readFileSync(targetPath, "utf-8");
		workflowData = JSON.parse(fileContent);
	} catch (e: any) {
		vscode.window.showErrorMessage(
			`Failed to read workflow file: ${e.message}`,
		);
		return;
	}

	// Bỏ qua logic tự parse params bằng showInputBox vì CLI đã có wizard (prompts) rất tốt.
	// Chúng ta sẽ gọi thẳng CLI và KHÔNG truyền --use-default-parameters để ép nó hiện wizard trong Terminal.

	const config = vscode.workspace.getConfiguration("automa");
	const keepBrowserOpen = !config.get<boolean>(
		"vault.run.closeBrowserOnFinish",
		true,
	);

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

	TaskRunner.runAutomaCli(args, {
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
