import * as vscode from "vscode";
import { spawn } from "child_process";
import { EventEmitter } from "events";
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

	public static runAutomaCli(cliArgs: string[], taskConfig: Omit<TaskOptions, 'command' | 'args'> & { useTelemetry?: boolean }): void {
		const { cmd, args } = DaemonManager.getInstance().resolveCommandAndArgs(cliArgs);
		
		const options: TaskOptions = {
			...taskConfig,
			command: cmd,
			args: args
		};

		if (taskConfig.useTelemetry) {
			this.runWithTelemetry(options);
		} else {
			this.run(options);
		}
	}

	public static run(options: TaskOptions): void {
		if (options.startMessage) {
			vscode.window.showInformationMessage(options.startMessage);
		}

		let statusBarItem: vscode.StatusBarItem | undefined;
		if (options.statusBarText) {
			statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
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
			env["AUTOMA_BROWSER_PATH"] = browserPathOverride;
		}

		const task = new vscode.Task(
			{ type: "automa", id: options.id },
			vscode.workspace.workspaceFolders?.[0] || vscode.TaskScope.Workspace,
			options.name,
			options.source || "Automa",
			new vscode.ProcessExecution(command, options.args, { env })
		);

		task.presentationOptions = {
			reveal: vscode.TaskRevealKind.Always,
			panel: vscode.TaskPanelKind.Shared
		};

		vscode.tasks.executeTask(task);

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
						vscode.window.showErrorMessage(`${options.errorMessage} (Exit code ${e.exitCode})`);
					}
				}
			}
		});
	}

	public static runWithTelemetry(options: TaskOptions): void {
		if (options.startMessage) {
			vscode.window.showInformationMessage(options.startMessage);
		}

		let statusBarItem: vscode.StatusBarItem | undefined;
		if (options.statusBarText) {
			statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
			statusBarItem.text = `$(sync~spin) ${options.statusBarText}`;
			statusBarItem.show();
		}

		const isWin = process.platform === "win32";
		const defaultCommand = isWin ? "npx.cmd" : "npx";
		const command = options.command || defaultCommand;

		const config = vscode.workspace.getConfiguration("automa");
		
		const env = { ...process.env };

		// Create an output channel to show logs
		const outputChannel = vscode.window.createOutputChannel(options.name);
		outputChannel.show(true);

		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		
		const child = spawn(command, options.args, { env, cwd, shell: isWin });

		child.stdout.on("data", (data) => {
			const str = data.toString();
			outputChannel.append(str);
			
			// Parse telemetry
			const lines = str.split("\n");
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith("{") && trimmed.includes('"type":"telemetry"')) {
					try {
						const telemetry = JSON.parse(trimmed);
						this.telemetryEmitter.emit("telemetry", telemetry);
					} catch (e) {
						// ignore parse error
					}
				}
			}
		});

		child.stderr.on("data", (data) => {
			outputChannel.append(data.toString());
		});

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
					vscode.window.showErrorMessage(`${options.errorMessage} (Exit code ${code})`);
				}
			}
		});
	}
}
