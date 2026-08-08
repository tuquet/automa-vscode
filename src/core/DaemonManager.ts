import { type ChildProcess, exec, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { Logger } from "./Logger";

const _execAsync = promisify(exec);

export class DaemonManager {
	private static instance: DaemonManager;
	public daemonProcess: ChildProcess | null = null;
	private port = 8765;
	private hasLoggedReuse = false;
	private statusBarItem: vscode.StatusBarItem;

	public isRunning(): boolean {
		return this.daemonProcess !== null;
	}

	private constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100,
		);
		this.statusBarItem.text = "$(circle-slash) Automa: Idle";
		this.statusBarItem.tooltip = "Automa CLI Daemon is not running";
		this.statusBarItem.command = "automa.toggleDaemon";
		this.statusBarItem.show();
	}

	public static getInstance(): DaemonManager {
		if (!DaemonManager.instance) {
			DaemonManager.instance = new DaemonManager();
		}
		return DaemonManager.instance;
	}

	public resolveCliPath(_extensionPath?: string): string {
		const config = vscode.workspace.getConfiguration("automa");
		const userCliPath = config.get<string>("cliPath");
		if (userCliPath && fs.existsSync(userCliPath)) {
			return userCliPath;
		}
		if (
			vscode.workspace.workspaceFolders &&
			vscode.workspace.workspaceFolders.length > 0
		) {
			const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
			const localCliPathSibling = path.join(
				workspaceRoot,
				"..",
				"automa-cli",
				"dist",
				"cli.js",
			);
			const localCliPathChild = path.join(
				workspaceRoot,
				"automa-cli",
				"dist",
				"cli.js",
			);
			if (fs.existsSync(localCliPathSibling)) {
				return localCliPathSibling;
			} else if (fs.existsSync(localCliPathChild)) {
				return localCliPathChild;
			}
		}
		return "npx tuquet-automa-cli";
	}

	public resolveCommandAndArgs(baseArgs: string[]): {
		cmd: string;
		args: string[];
	} {
		const cliPath = this.resolveCliPath();
		const isWin = process.platform === "win32";

		if (cliPath === "npx tuquet-automa-cli") {
			return {
				cmd: isWin ? "npx.cmd" : "npx",
				args: ["-y", "tuquet-automa-cli@latest", ...baseArgs],
			};
		}

		const cmd = cliPath.endsWith(".ts")
			? isWin
				? "npx.cmd tsx"
				: "npx tsx"
			: "node";
		return { cmd, args: [cliPath, ...baseArgs] };
	}

	public async executeCliCommand(args: string[]): Promise<unknown> {
		const { cmd, args: resolvedArgs } = this.resolveCommandAndArgs(args);

		const finalArgs = resolvedArgs.includes("--json")
			? resolvedArgs
			: [...resolvedArgs, "--json"];

		const config = vscode.workspace.getConfiguration("automa");
		const browserPathOverride = config.get<string>("browserPathOverride") || "";
		const extensionPaths = config.get<string>("extensionPaths") || "";
		const env = { ...process.env };
		if (browserPathOverride) {
			env.AUTOMA_BROWSER_PATH = browserPathOverride;
		}
		if (extensionPaths) {
			env.EXTENSION_PATHS = extensionPaths;
		}

		const cmdParts = cmd.split(" ");
		const executable = cmdParts[0];
		const spawnArgs = [...cmdParts.slice(1), ...finalArgs];

		let output = "";
		try {
			const result: { stdout: string; stderr: string } = await new Promise(
				(resolve, reject) => {
					const child = spawn(executable, spawnArgs, {
						env,
						shell:
							process.platform === "win32" &&
							(executable === "npx" || executable === "npx.cmd"),
					});

					const stdoutChunks: Buffer[] = [];
					const stderrChunks: Buffer[] = [];

					child.stdout?.on("data", (data) => {
						stdoutChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
					});

					child.stderr?.on("data", (data) => {
						stderrChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
					});

					child.on("error", reject);

					child.on("close", (_code) => {
						resolve({
							stdout: Buffer.concat(stdoutChunks).toString("utf-8").trim(),
							stderr: Buffer.concat(stderrChunks).toString("utf-8").trim(),
						});
					});
				},
			);

			if (result.stderr) {
				Logger.info(`[CLI] stderr: ${result.stderr}`);
			}
			output = result.stdout || result.stderr;
		} catch (error: unknown) {
			const e =
				error instanceof Error ? error : new Error(String(error as unknown));
			output = e.message || String(e);
		}

		const extractJSON = (str: string) => {
			const trimmed = str.trim();
			try {
				return JSON.parse(trimmed);
			} catch (err: unknown) {
				const errMsg = err instanceof Error ? err.message : String(err);
				Logger.info(`[Daemon IPC] First parse attempt failed: ${errMsg}`);
			}

			// Find first { or [ and last } or ]
			const firstCurly = trimmed.indexOf("{");
			const firstSquare = trimmed.indexOf("[");
			const firstIdx =
				firstCurly === -1
					? firstSquare
					: firstSquare === -1
						? firstCurly
						: Math.min(firstCurly, firstSquare);
			const isObject = firstIdx !== -1 && firstIdx === firstCurly;
			const lastIdx = isObject
				? trimmed.lastIndexOf("}")
				: trimmed.lastIndexOf("]");

			if (firstIdx !== -1 && lastIdx !== -1 && firstIdx < lastIdx) {
				const potentialJson = trimmed.substring(firstIdx, lastIdx + 1);
				try {
					return JSON.parse(potentialJson);
				} catch (err: unknown) {
					const errMsg = err instanceof Error ? err.message : String(err);
					Logger.info(`[Daemon IPC] Substring parse attempt failed: ${errMsg}`);
				}
			}

			// Fallback: Check the last few lines for a single-line complete JSON without O(N) split allocation
			let currentEnd = trimmed.length;
			for (let i = 0; i < 100; i++) {
				if (currentEnd <= 0) break;
				const prevNewline = trimmed.lastIndexOf("\n", currentEnd - 1);
				const startIndex = prevNewline === -1 ? 0 : prevNewline + 1;
				const line = trimmed.substring(startIndex, currentEnd).trim();

				if (line.startsWith("{") || line.startsWith("[")) {
					try {
						return JSON.parse(line);
					} catch (err: unknown) {
						const errMsg = err instanceof Error ? err.message : String(err);
						Logger.info(`[Daemon IPC] Line parse attempt failed: ${errMsg}`);
					}
				}

				if (prevNewline === -1) break;
				currentEnd = prevNewline;
			}

			throw new Error("No valid JSON found in output");
		};

		let parsed: unknown;
		try {
			parsed = extractJSON(output);
			return parsed;
		} catch (error: unknown) {
			const e =
				error instanceof Error ? error : new Error(String(error as unknown));
			throw new Error(
				`Failed to parse CLI JSON output: ${e.message}\nOutput was: ${output}`,
			);
		}
	}

	public async executeRawCliCommand(
		args: string[],
	): Promise<{ stdout: string; stderr: string }> {
		const { cmd, args: finalArgs } = this.resolveCommandAndArgs(args);
		const cmdParts = cmd.split(" ");
		const executable = cmdParts[0];
		const spawnArgs = [...cmdParts.slice(1), ...finalArgs];

		try {
			return await new Promise((resolve, reject) => {
				const child = spawn(executable, spawnArgs, {
					shell:
						process.platform === "win32" &&
						(executable === "npx" || executable === "npx.cmd"),
				});

				const stdoutChunks: Buffer[] = [];
				const stderrChunks: Buffer[] = [];

				child.stdout?.on("data", (data) => {
					stdoutChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
				});

				child.stderr?.on("data", (data) => {
					stderrChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
				});

				child.on("error", reject);

				child.on("close", () => {
					resolve({
						stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
						stderr: Buffer.concat(stderrChunks).toString("utf-8"),
					});
				});
			});
		} catch (error: unknown) {
			const e =
				error instanceof Error ? error : new Error(String(error as unknown));
			return { stdout: "", stderr: e.message || String(e) };
		}
	}

	public getPort(): number {
		return this.port;
	}

	private async checkAutomaHealth(port: number): Promise<boolean> {
		try {
			const res = await fetch(`http://localhost:${port}/api/health`, {
				method: "GET",
			});
			if (res.ok) {
				const data = (await res.json()) as { status?: string };
				return data.status === "ok";
			}
		} catch (_e: unknown) {
			// Ignore fetch errors (e.g. connection refused)
		}
		return false;
	}

	private async findAvailablePort(startPort: number): Promise<number> {
		const isPortAvailable = (port: number): Promise<boolean> => {
			return new Promise((resolve) => {
				const tester = net
					.createServer()
					.once("error", () => resolve(false))
					.once("listening", () => {
						tester.once("close", () => resolve(true)).close();
					})
					.listen(port);
			});
		};

		let port = startPort;
		while (port < startPort + 100) {
			if (await isPortAvailable(port)) {
				return port;
			}
			port++;
		}
		return startPort; // Fallback
	}

	public async start(): Promise<void> {
		if (this.daemonProcess) {
			Logger.info("Automa daemon is already running.");
			return;
		}

		this.statusBarItem.text = "$(sync~spin) Automa: Starting";
		this.statusBarItem.tooltip = "Starting Automa CLI Daemon...";

		try {
			const config = vscode.workspace.getConfiguration("automa");

			const basePort = config.get<number>("daemon.port", 8765);

			// 0. Check if Automa is already running on the base port (e.g. from another VS Code instance)
			if (await this.checkAutomaHealth(basePort)) {
				if (!this.hasLoggedReuse) {
					Logger.info(
						`[Daemon] Automa Server is already running on port ${basePort}. Reusing existing process.`,
					);
					this.hasLoggedReuse = true;
				}
				this.port = basePort;

				this.statusBarItem.text = `$(check) Automa: :${this.port}`;
				this.statusBarItem.tooltip =
					"Automa CLI Daemon is running externally (Click to ignore)";

				return;
			}

			// 1. Dynamic Port allocation if base port is occupied by something else
			this.port = await this.findAvailablePort(basePort);

			// 2. Smart CLI Resolve
			const { cmd, args } = this.resolveCommandAndArgs([
				"serve",
				"--port",
				this.port.toString(),
			]);

			Logger.info(
				`Starting Automa background daemon on port ${this.port} via ${cmd} ${args.join(" ")}...`,
			);

			this.spawnDaemonProcess(cmd, args, config);

			// Wait a bit for server to start
			await new Promise((resolve) => setTimeout(resolve, 2000));
			Logger.info("Automa background daemon started.");
			this.hasLoggedReuse = false;
			this.statusBarItem.text = `$(radio-tower) Automa: :${this.port}`;
			this.statusBarItem.tooltip =
				"Automa CLI Daemon is running (Click to stop)";
		} catch (error: unknown) {
			const e =
				error instanceof Error ? error : new Error(String(error as unknown));
			Logger.error(`Failed to launch daemon: ${e.message}`);
			this.updateStatusStopped();
		}
	}

	private spawnDaemonProcess(
		cmd: string,
		args: string[],
		config: vscode.WorkspaceConfiguration,
	) {
		const browserPathOverride = config.get<string>("browserPathOverride") || "";
		const extensionPaths = config.get<string>("extensionPaths") || "";
		const env = { ...process.env };
		if (browserPathOverride) {
			env.AUTOMA_BROWSER_PATH = browserPathOverride;
		}
		if (extensionPaths) {
			env.EXTENSION_PATHS = extensionPaths;
		}

		this.daemonProcess = spawn(cmd, args, {
			shell: true,
			detached: false,
			stdio: "pipe",
			env,
		});

		this.attachProcessListeners();
	}

	private attachProcessListeners() {
		if (!this.daemonProcess) return;

		const { StringDecoder } = require("node:string_decoder");
		const stdoutDecoder = new StringDecoder("utf-8");
		const stderrDecoder = new StringDecoder("utf-8");

		if (this.daemonProcess.stdout) {
			this.daemonProcess.stdout.on("data", (data: Buffer) => {
				const msg = stdoutDecoder.write(data).trim();
				if (msg) {
					Logger.info(`[CLI Daemon] ${msg}`);
				}
			});
		}

		if (this.daemonProcess.stderr) {
			this.daemonProcess.stderr.on("data", (data: Buffer) => {
				const msg = stderrDecoder.write(data).trim();
				if (msg) {
					Logger.error(`[CLI Daemon] ${msg}`);
				}
			});
		}

		this.daemonProcess.on("error", (err) => {
			Logger.error(`Failed to start Automa daemon: ${err.message}`);
			this.daemonProcess = null;
			this.updateStatusStopped();
		});

		this.daemonProcess.on("exit", (code) => {
			Logger.warn(`Automa daemon exited with code ${code}`);
			this.daemonProcess = null;
			this.hasLoggedReuse = false;
			this.updateStatusStopped();
		});
	}

	private updateStatusStopped() {
		this.statusBarItem.text = "$(circle-slash) Automa: Idle";
		this.statusBarItem.tooltip = "Automa CLI Daemon is stopped";
	}

	public stop() {
		if (this.daemonProcess) {
			this.daemonProcess.kill();
			this.daemonProcess = null;
			Logger.info("Automa background daemon stopped.");
		}
		this.hasLoggedReuse = false;
		this.updateStatusStopped();
	}
}
