import { exec } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { HistoryTreeProvider, type JobItem } from "./HistoryTreeProvider";

const execAsync = promisify(exec);

let terminal: vscode.Terminal | null = null;

function getOrCreateTerminal(): vscode.Terminal {
	if (terminal === null) {
		terminal = vscode.window.createTerminal("Automa CLI");
		vscode.window.onDidCloseTerminal((t) => {
			if (t === terminal) {
				terminal = null;
			}
		});
	}
	terminal.show();
	return terminal;
}

export function activate(context: vscode.ExtensionContext) {
	console.log("Automa VS Code Extension is now active!");

	// Output Channel for Logs
	const logOutputChannel = vscode.window.createOutputChannel(
		"Automa Execution Logs",
	);
	context.subscriptions.push(logOutputChannel);

	// Tree View
	const historyProvider = new HistoryTreeProvider();
	vscode.window.registerTreeDataProvider("automa.historyView", historyProvider);

	// Command: Open Studio
	const openStudioCmd = vscode.commands.registerCommand(
		"automa.openStudio",
		() => {
			vscode.window.showInformationMessage(
				"Launching Automa Studio in Terminal...",
			);
			const t = getOrCreateTerminal();
			t.sendText("npx automa studio");
		},
	);

	// Command: Refresh History
	const refreshHistoryCmd = vscode.commands.registerCommand(
		"automa.refreshHistory",
		() => {
			historyProvider.refresh();
		},
	);

	// Command: View Log
	const viewLogCmd = vscode.commands.registerCommand(
		"automa.viewLog",
		async (node: JobItem) => {
			try {
				logOutputChannel.show(true);
				logOutputChannel.clear();
				logOutputChannel.appendLine(`Fetching logs for job: ${node.job.id}...`);

				const { stdout } = await execAsync(
					`npx automa log ${node.job.id} --json`,
					{ cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath },
				);
				const logs = JSON.parse(stdout.trim());

				if (logs.error) {
					logOutputChannel.appendLine(`Error: ${logs.error}`);
					return;
				}

				logOutputChannel.clear();
				logOutputChannel.appendLine(`=== LOGS FOR JOB: ${node.job.id} ===`);
				logOutputChannel.appendLine(
					`Status: ${node.job.status} | Created: ${node.job.created_at}`,
				);
				logOutputChannel.appendLine(
					`---------------------------------------------------`,
				);

				if (logs.length === 0) {
					logOutputChannel.appendLine(`No logs found.`);
				} else {
					for (const log of logs) {
						let text = log.message;
						try {
							const parsedMsg = JSON.parse(log.message);
							if (parsedMsg.name || parsedMsg.description) {
								const blockName =
									parsedMsg.name || parsedMsg.blockId || "unknown";
								const desc = parsedMsg.description || "";
								const status =
									parsedMsg.type === "error" || parsedMsg.status === "error"
										? "LỖI"
										: "THÀNH CÔNG";
								const errText = parsedMsg.message
									? `: ${parsedMsg.message}`
									: "";
								const durationText = parsedMsg.duration
									? ` (${parsedMsg.duration}ms)`
									: "";
								text = `[Block: ${blockName}] ${desc} - ${status}${errText}${durationText}`;
							}
						} catch (_e) {}
						logOutputChannel.appendLine(
							`[${log.created_at}] [${log.type}] ${text}`,
						);
					}
				}
			} catch (error: any) {
				vscode.window.showErrorMessage(
					`Failed to fetch logs: ${error.message}`,
				);
			}
		},
	);

	// Command: Run Workflow
	const runWorkflowCmd = vscode.commands.registerCommand(
		"automa.runWorkflow",
		async (nodeOrUri?: any) => {
			let commandArgs = "";
			let displayName = "";

			if (nodeOrUri?.fsPath) {
				// Local file triggered from VS Code Explorer or Editor
				commandArgs = `"${nodeOrUri.fsPath}"`;
				displayName = path.basename(nodeOrUri.fsPath);
			} else if (nodeOrUri?.fullPath) {
				// Local file triggered from Automa TreeView
				commandArgs = `"${nodeOrUri.fullPath}"`;
				displayName = nodeOrUri.label;
			} else {
				// Manual input
				const input = await vscode.window.showInputBox({
					prompt:
						"Enter absolute path to workflow JSON or Workflow ID (if cloud)",
					placeHolder: "e.g. C:\\path\\to\\workflow.json or daily-checkin",
				});
				if (!input) return;

				if (input.endsWith(".json")) {
					commandArgs = `"${input}"`;
				} else {
					commandArgs = `--id "${input}"`;
				}
				displayName = input;
			}

			vscode.window.showInformationMessage(`Running workflow: ${displayName}`);
			const t = getOrCreateTerminal();
			t.sendText(`npx automa run ${commandArgs}`);
		},
	);

	context.subscriptions.push(
		openStudioCmd,
		runWorkflowCmd,
		refreshHistoryCmd,
		viewLogCmd,
	);
}

export function deactivate() {}
