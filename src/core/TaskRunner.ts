import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import * as vscode from "vscode";
import { castRecord } from "../utils/typeGuards";
import { DaemonManager } from "./DaemonManager";

export interface TaskOptions {
	id: string;
	name: string;
	command?: string;
	source?: string;
	args: string[];
	startMessage?: string;
	successMessage?: string;
	errorMessage?: string;
	statusBarText?: string;
}

export const TaskRunner = {
	telemetryEmitter: new EventEmitter(),

	runAutomaCli(
		cliArgs: string[],
		taskConfig: Omit<TaskOptions, "command" | "args"> & {
			useTelemetry?: boolean;
		},
	): Promise<void> {
		const { cmd, args } =
			DaemonManager.getInstance().resolveCommandAndArgs(cliArgs);

		const options: TaskOptions = {
			...taskConfig,
			command: cmd,
			args: args,
		};

		if (taskConfig.useTelemetry) {
			return TaskRunner.runWithTelemetry(options);
		} else {
			return TaskRunner.run(options);
		}
	},

	run(options: TaskOptions): Promise<void> {
		if (options.startMessage) {
			vscode.window.showInformationMessage(options.startMessage);
		}

		let statusBarItem: vscode.StatusBarItem | undefined;
		if (options.statusBarText) {
			statusBarItem = vscode.window.createStatusBarItem(
				vscode.StatusBarAlignment.Right,
				100,
			);
			statusBarItem.text = `$(sync~spin) ${options.statusBarText}`;
			statusBarItem.show();
		}

		const isWin = process.platform === "win32";
		const defaultCommand = isWin ? "npx.cmd" : "npx";
		const command = options.command || defaultCommand;

		const config = vscode.workspace.getConfiguration("automa");
		const browserPathOverride = config.get<string>("browserPathOverride") || "";

		const env: { [key: string]: string } = {};
		for (const key in process.env) {
			if (process.env[key] !== undefined) {
				env[key] = process.env[key] as string;
			}
		}

		if (browserPathOverride) {
			env.AUTOMA_BROWSER_PATH = browserPathOverride;
		}

		const task = new vscode.Task(
			{ type: "automa", id: options.id },
			vscode.workspace.workspaceFolders?.[0] || vscode.TaskScope.Workspace,
			options.name,
			options.source || "Automa",
			new vscode.ProcessExecution(command, options.args, { env }),
		);

		task.presentationOptions = {
			reveal: vscode.TaskRevealKind.Always,
			panel: vscode.TaskPanelKind.Shared,
		};

		vscode.tasks.executeTask(task);

		return new Promise((resolve) => {
			const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
				if (e.execution.task === task) {
					if (statusBarItem) {
						statusBarItem.hide();
						statusBarItem.dispose();
					}
					disposable.dispose();

					if (e.exitCode === 0) {
						if (options.successMessage) {
							vscode.window.showInformationMessage(options.successMessage);
						}
					} else {
						if (options.errorMessage) {
							vscode.window.showErrorMessage(
								`${options.errorMessage} (Exit code ${e.exitCode})`,
							);
						}
					}
					resolve();
				}
			});
		});
	},

	runWithTelemetry(options: TaskOptions): Promise<void> {
		if (options.startMessage) {
			vscode.window.showInformationMessage(options.startMessage);
		}

		let statusBarItem: vscode.StatusBarItem | undefined;
		if (options.statusBarText) {
			statusBarItem = vscode.window.createStatusBarItem(
				vscode.StatusBarAlignment.Right,
				100,
			);
			statusBarItem.text = `$(sync~spin) ${options.statusBarText}`;
			statusBarItem.show();
		}

		const isWin = process.platform === "win32";
		const defaultCommand = isWin ? "npx.cmd" : "npx";
		const command = options.command || defaultCommand;

		const _config = vscode.workspace.getConfiguration("automa");
		const browserPathOverride =
			_config.get<string>("browserPathOverride") || "";
		const extensionPaths = _config.get<string>("extensionPaths") || "";

		const env: { [key: string]: string } = {};
		for (const key in process.env) {
			if (process.env[key] !== undefined) {
				env[key] = process.env[key] as string;
			}
		}

		if (browserPathOverride) {
			env.AUTOMA_BROWSER_PATH = browserPathOverride;
		}
		if (extensionPaths) {
			env.EXTENSION_PATHS = extensionPaths;
		}

		// Create an output channel to show logs
		const outputChannel = vscode.window.createOutputChannel(options.name);
		outputChannel.show(true);

		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		const child = spawn(command, options.args, { env, cwd, shell: isWin });

		const readline = require("node:readline");
		const rl = readline.createInterface({
			input: child.stdout,
			terminal: false,
		});

		rl.on("line", (line: string) => {
			outputChannel.appendLine(line);
			const trimmed = line.trim();
			const match = trimmed.match(/("type":"telemetry".+)/);
			if (match) {
				try {
					// Look for a valid JSON boundary. Automa outputs it as a complete object.
					const start = trimmed.indexOf("{");
					const end = trimmed.lastIndexOf("}");
					if (start !== -1 && end !== -1 && end > start) {
						const telemetry = castRecord(
							JSON.parse(trimmed.substring(start, end + 1)),
						);
						TaskRunner.telemetryEmitter.emit("telemetry", telemetry);
					}
				} catch (_e: unknown) {
					// ignore parse error
				}
			}
		});

		child.stderr.on("data", (data) => {
			outputChannel.append(data.toString());
		});

		return new Promise((resolve) => {
			child.on("close", (code) => {
				if (statusBarItem) {
					statusBarItem.hide();
					statusBarItem.dispose();
				}

				if (code === 0) {
					if (options.successMessage) {
						vscode.window.showInformationMessage(options.successMessage);
					}
				} else {
					if (options.errorMessage) {
						vscode.window.showErrorMessage(
							`${options.errorMessage} (Exit code ${code})`,
						);
					}
				}
				resolve();
			});
		});
	},
};
