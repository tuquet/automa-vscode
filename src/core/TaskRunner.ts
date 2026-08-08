import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import * as vscode from "vscode";
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

export class TaskRunner {
	public static telemetryEmitter = new EventEmitter();

	public static runAutomaCli(
		cliArgs: string[],
		taskConfig: Omit<TaskOptions, "command" | "args"> & {
			useTelemetry?: boolean;
		},
	): Promise<void> {
		const { cmd, args } =
			DaemonManager.getInstance().resolveCommandAndArgs(cliArgs);

		const cmdParts = cmd.split(" ");
		const executable = cmdParts[0];
		const finalArgs = [...cmdParts.slice(1), ...args];

		const options: TaskOptions = {
			...taskConfig,
			command: executable,
			args: finalArgs,
		};

		if (taskConfig.useTelemetry) {
			return TaskRunner.runWithTelemetry(options);
		} else {
			return TaskRunner.run(options);
		}
	}

	public static run(options: TaskOptions): Promise<void> {
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
	}

	public static runWithTelemetry(options: TaskOptions): Promise<void> {
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

		const env = { ...process.env };

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
			if (trimmed.includes('"type":"telemetry"')) {
				const start = trimmed.indexOf("{");
				const end = trimmed.lastIndexOf("}");
				if (start !== -1 && end !== -1 && end > start) {
					try {
						const telemetry = JSON.parse(
							trimmed.substring(start, end + 1),
						) as unknown;
						TaskRunner.telemetryEmitter.emit("telemetry", telemetry);
					} catch (_e: unknown) {
						// ignore parse error
					}
				}
			}
		});

		const { StringDecoder } = require("node:string_decoder");
		const stderrDecoder = new StringDecoder("utf-8");

		child.stderr.on("data", (data: Buffer) => {
			outputChannel.append(stderrDecoder.write(data));
		});

		child.stderr.on("end", () => {
			const remainder = stderrDecoder.end();
			if (remainder) outputChannel.append(remainder);
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
	}
}
