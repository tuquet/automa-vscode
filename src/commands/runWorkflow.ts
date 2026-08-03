import * as path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";

let automaOutputChannel: vscode.OutputChannel;

export async function runWorkflowCommand(nodeOrUri?: any, params?: any, runOptions?: { keepBrowserOpen?: boolean }) {
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
		vscode.window.showErrorMessage("Cloud workflows are not supported yet via API.");
		return;
	}

	try {
		const fileContent = fs.readFileSync(targetPath, "utf-8");
		workflowData = JSON.parse(fileContent);
	} catch (e: any) {
		vscode.window.showErrorMessage(`Failed to read workflow file: ${e.message}`);
		return;
	}

	const config = vscode.workspace.getConfiguration("automa");
	
	const keepBrowserOpen = runOptions?.keepBrowserOpen ?? !config.get<boolean>("vault.run.closeBrowserOnFinish", true);

	const options: any = {
		useDefaultParameters: config.get<boolean>("run.useDefaultParameters"),
		logPath: config.get<string>("vault.run.logPath"),
		debug: config.get<boolean>("vault.run.debug"),
		variables: params ? params : undefined,
		browserSettings: {
			headless: config.get<boolean>("vault.run.headless"),
			closeBrowserOnFinish: !keepBrowserOpen,
			defaultBrowser: config.get<string>("vault.run.defaultBrowser"),
		}
	};

	const isWin = process.platform === "win32";
	let cmd = isWin ? "npx.cmd" : "npx";
	let args = ["-y", "tuquet-automa-cli@latest", "run", targetPath];

	const userCliPath = config.get<string>("cliPath");
	if (userCliPath && fs.existsSync(userCliPath)) {
		cmd = "node";
		args = [userCliPath, "run", targetPath];
	} else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
		const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
		const localCliPath = path.join(workspaceRoot, "..", "automa-cli", "dist", "cli.js");
		if (fs.existsSync(localCliPath)) {
			cmd = "node";
			args = [localCliPath, "run", targetPath];
		}
	}

	if (params && Object.keys(params).length > 0) {
		args.push("--variables", JSON.stringify(params));
	}
	
	// Add other options as env vars or flags if supported by CLI. 
	// For now, the CLI relies on env or config for headless/browser path.

	TaskRunner.run({
		id: `workflow-${Date.now()}`,
		name: `Workflow: ${displayName}`,
		command: cmd,
		source: "Automa",
		args: args,
		startMessage: `Running Workflow: ${displayName}`,
		successMessage: `Workflow finished: ${displayName}`,
		errorMessage: `Workflow failed: ${displayName}`,
		statusBarText: `Running: ${displayName}`
	});
}
