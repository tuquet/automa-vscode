import { type ChildProcess, exec, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { toError } from "../utils/typeGuards";
import { Logger } from "./Logger";

const _execAsync = promisify(exec);

export class DaemonManager {
	private static instance: DaemonManager;
	public daemonProcess: ChildProcess | null = null;
	private port = 8765;
	private hasLoggedReuse = false;
	private statusBarItem: vscode.StatusBarItem;

	private async tryProxyCommand(args: string[]): Promise<unknown | undefined> {
		if (!this.port) return undefined;
		const cmd = args[0];
		try {
			if (cmd === "history") {
				const res = await fetch(
					`http://localhost:${this.port}/api/jobs/history`,
				);
				if (res.ok) return await res.json();
			} else if (cmd === "clear-history") {
				const res = await fetch(`http://localhost:${this.port}/api/jobs`, {
					method: "DELETE",
				});
				if (res.ok) return await res.json();
			} else if (cmd === "delete-history" && args[1]) {
				const res = await fetch(
					`http://localhost:${this.port}/api/jobs/${args[1]}`,
					{ method: "DELETE" },
				);
				if (res.ok) return await res.json();
			} else if (cmd === "log" && args[1]) {
				const res = await fetch(
					`http://localhost:${this.port}/api/jobs/${args[1]}/logs`,
				);
				if (res.ok) return await res.json();
			}
		} catch (_e: unknown) {
			// ignore and fallback
		}
		return undefined;
	}

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
		const proxiedRes = await this.tryProxyCommand(args);
		if (proxiedRes !== undefined) {
			return proxiedRes;
		}

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

		let outputBuf: Buffer;
		let outputErr = "";
		try {
			const result = await new Promise<{ stdout: Buffer; stderr: string }>(
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
							stdout: Buffer.concat(stdoutChunks),
							stderr: Buffer.concat(stderrChunks).toString("utf-8").trim(),
						});
					});
				},
			);

			if (result.stderr) {
				Logger.debug(`[CLI] stderr: ${result.stderr}`);
			}
			outputBuf = result.stdout;
			outputErr = result.stderr;
		} catch (error: unknown) {
			const e = toError(error);
			outputErr = e.message || String(e);
			outputBuf = Buffer.from(outputErr);
		}

		const extractJSONFromBuffer = (buf: Buffer): unknown => {
			const str = buf.toString("utf-8").trim();

			// Fast path for exact JSON
			try {
				return JSON.parse(str);
			} catch (_e: unknown) {}

			// Split by newline and try to parse the last non-empty line
			// This handles cases where npm warnings or console.log are printed before JSON
			const lines = str.split("\n");
			for (let i = lines.length - 1; i >= 0; i--) {
				const line = lines[i].trim();
				if (
					(line.startsWith("{") && line.endsWith("}")) ||
					(line.startsWith("[") && line.endsWith("]"))
				) {
					try {
						return JSON.parse(line);
					} catch (_e: unknown) {}
				}
			}

			// Fallback: extract valid JSON blocks using bracket matching (AST-like)
			const findValidJson = (
				text: string,
				startChar: string,
				endChar: string,
			): unknown => {
				let startIndex = text.indexOf(startChar);
				let lastValidJson: unknown;
				while (startIndex !== -1) {
					let depth = 0;
					let inString = false;
					let isEscape = false;
					let endIndex = -1;

					for (let i = startIndex; i < text.length; i++) {
						const char = text[i];
						if (isEscape) {
							isEscape = false;
							continue;
						}
						if (char === "\\") {
							isEscape = true;
							continue;
						}
						if (char === '"') {
							inString = !inString;
							continue;
						}
						if (!inString) {
							if (char === startChar) {
								depth++;
							} else if (char === endChar) {
								depth--;
								if (depth === 0) {
									endIndex = i;
									break;
								}
							}
						}
					}

					if (endIndex !== -1) {
						const possibleJson = text.substring(startIndex, endIndex + 1);
						try {
							lastValidJson = JSON.parse(possibleJson);
						} catch (_e: unknown) {
							// Invalid JSON
						}
					}

					startIndex = text.indexOf(startChar, startIndex + 1);
				}
				return lastValidJson;
			};

			const objResult = findValidJson(str, "{", "}");
			if (objResult !== undefined) return objResult;

			const arrResult = findValidJson(str, "[", "]");
			if (arrResult !== undefined) return arrResult;

			throw new Error("No valid JSON found in output");
		};

		try {
			return extractJSONFromBuffer(outputBuf);
		} catch (error: unknown) {
			const e = toError(error);
			// Only slice a small portion to prevent massive memory usage on error logs
			const outputPreview =
				outputBuf.length > 5000
					? outputBuf.subarray(outputBuf.length - 5000).toString("utf-8")
					: outputBuf.toString("utf-8");
			throw new Error(
				`Failed to parse CLI JSON output: ${e.message}\nOutput preview was: ...${outputPreview}`,
			);
		}
	}

	public async executeRawCliCommand(
		args: string[],
	): Promise<{ stdout: string; stderr: string; code: number | null }> {
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

				child.on("close", (code) => {
					let stdoutStr = "";
					let stderrStr = "";
					try {
						stdoutStr = Buffer.concat(stdoutChunks).toString("utf-8");
					} catch (_e: unknown) {
						stdoutStr = "[Stdout exceeded string length limit]";
					}
					try {
						stderrStr = Buffer.concat(stderrChunks).toString("utf-8");
					} catch (_e: unknown) {
						stderrStr = "[Stderr exceeded string length limit]";
					}
					resolve({ stdout: stdoutStr || "", stderr: stderrStr || "", code });
				});
			});
		} catch (error: unknown) {
			const e = toError(error);
			return { stdout: "", stderr: e.message || String(e), code: -1 };
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

			// Wait for server to start (poll health check to remove bottleneck)
			let isHealthy = false;
			for (let i = 0; i < 20; i++) {
				isHealthy = await this.checkAutomaHealth(this.port);
				if (isHealthy) break;
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
			if (!isHealthy) {
				Logger.warn(`Automa daemon on port ${this.port} may not be ready yet.`);
			}
			Logger.info("Automa background daemon started.");
			this.hasLoggedReuse = false;
			this.statusBarItem.text = `$(radio-tower) Automa: :${this.port}`;
			this.statusBarItem.tooltip =
				"Automa CLI Daemon is running (Click to stop)";
		} catch (error: unknown) {
			const e = toError(error);
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

		const cmdParts = cmd.split(" ");
		const executable = cmdParts[0];
		const spawnArgs = [...cmdParts.slice(1), ...args];

		this.daemonProcess = spawn(executable, spawnArgs, {
			shell:
				process.platform === "win32" &&
				(executable === "npx" || executable === "npx.cmd"),
			detached: false,
			stdio: "pipe",
			env,
		});

		this.attachProcessListeners();
	}

	private attachProcessListeners() {
		if (!this.daemonProcess) return;

		if (this.daemonProcess.stdout) {
			this.daemonProcess.stdout.on("data", (data) => {
				const msg = data.toString().trim();
				if (msg) {
					Logger.info(`[CLI Daemon] ${msg}`);
				}
			});
		}

		if (this.daemonProcess.stderr) {
			this.daemonProcess.stderr.on("data", (data) => {
				const msg = data.toString().trim();
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
