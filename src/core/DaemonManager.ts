import { type ChildProcess, exec, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { Logger } from "./Logger";

const execAsync = promisify(exec);

export class DaemonManager {
	private static instance: DaemonManager;
	private daemonProcess: ChildProcess | null = null;
	private port = 8765;
	private hasLoggedReuse = false;
	private statusBarItem: vscode.StatusBarItem;

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

	public async executeCliCommand(args: string[]): Promise<any> {
		const { cmd, args: resolvedArgs } = this.resolveCommandAndArgs(args);

		const argsStr = resolvedArgs.includes("--json")
			? resolvedArgs.map((a) => `"${a}"`).join(" ")
			: [...resolvedArgs, "--json"].map((a) => `"${a}"`).join(" ");

		const execCmd = `${cmd} ${argsStr}`;

		const { stdout, stderr } = await execAsync(execCmd, {
			maxBuffer: 1024 * 1024 * 10,
		}).catch((e) => e);
		const output = stdout || stderr || "";

		let jsonStr = output.trim();
		const firstBrace = jsonStr.indexOf("{");
		const firstBracket = jsonStr.indexOf("[");
		const lastBrace = jsonStr.lastIndexOf("}");
		const lastBracket = jsonStr.lastIndexOf("]");
		let startIndex = -1;
		let endIndex = jsonStr.length;

		if (firstBrace !== -1 && firstBracket !== -1) {
			startIndex = Math.min(firstBrace, firstBracket);
			endIndex = startIndex === firstBrace ? lastBrace + 1 : lastBracket + 1;
		} else if (firstBrace !== -1) {
			startIndex = firstBrace;
			endIndex = lastBrace + 1;
		} else if (firstBracket !== -1) {
			startIndex = firstBracket;
			endIndex = lastBracket + 1;
		}

		if (startIndex !== -1 && endIndex > startIndex) {
			jsonStr = jsonStr.substring(startIndex, endIndex);
		}

		try {
			return JSON.parse(jsonStr);
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			throw new Error(
				`Failed to parse CLI JSON output: ${e.message}\nOutput was: ${output}`,
			);
		}
	}

	public async executeRawCliCommand(
		args: string[],
	): Promise<{ stdout: string; stderr: string }> {
		const { cmd, args: finalArgs } = this.resolveCommandAndArgs(args);
		const commandStr = `${cmd} ${finalArgs.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ")}`;
		const { stdout, stderr } = await execAsync(commandStr, {
			maxBuffer: 1024 * 1024 * 10,
		});
		return { stdout, stderr };
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
				const data = (await res.json()) as any;
				return data.status === "ok";
			}
		} catch (_e) {
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
			const e = error instanceof Error ? error : new Error(String(error));
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
		const env = { ...process.env };
		if (browserPathOverride) {
			env.AUTOMA_BROWSER_PATH = browserPathOverride;
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
