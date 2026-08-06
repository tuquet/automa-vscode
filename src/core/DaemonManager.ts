import * as vscode from "vscode";
import { spawn, ChildProcess, exec } from "node:child_process";
import { Logger } from "./Logger";
import * as path from "node:path";
import * as fs from "node:fs";
import * as net from "node:net";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export class DaemonManager {
	private static instance: DaemonManager;
	private daemonProcess: ChildProcess | null = null;
	private port = 8765;
	private hasLoggedReuse = false;
	private statusBarItem: vscode.StatusBarItem;

	private constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
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

	public resolveCliPath(extensionPath?: string): string {
		const config = vscode.workspace.getConfiguration("automa");
		const userCliPath = config.get<string>("cliPath");
		if (userCliPath && fs.existsSync(userCliPath)) {
			return userCliPath;
		}
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
			const localCliPathSibling = path.join(workspaceRoot, "..", "automa-cli", "dist", "cli.js");
			const localCliPathChild = path.join(workspaceRoot, "automa-cli", "dist", "cli.js");
			if (fs.existsSync(localCliPathSibling)) {
				return localCliPathSibling;
			} else if (fs.existsSync(localCliPathChild)) {
				return localCliPathChild;
			}
		}
		return "npx tuquet-automa-cli";
	}

	public resolveCommandAndArgs(baseArgs: string[]): { cmd: string, args: string[] } {
		const config = vscode.workspace.getConfiguration("automa");
		const userCliPath = config.get<string>("cliPath");
		const isWin = process.platform === "win32";

		if (userCliPath && fs.existsSync(userCliPath)) {
			return { cmd: "node", args: [userCliPath, ...baseArgs] };
		}
		
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
			const localCliPathSibling = path.join(workspaceRoot, "..", "automa-cli", "dist", "cli.js");
			const localCliPathChild = path.join(workspaceRoot, "automa-cli", "dist", "cli.js");
			if (fs.existsSync(localCliPathSibling)) {
				return { cmd: "node", args: [localCliPathSibling, ...baseArgs] };
			} else if (fs.existsSync(localCliPathChild)) {
				return { cmd: "node", args: [localCliPathChild, ...baseArgs] };
			}
		}

		return {
			cmd: isWin ? "npx.cmd" : "npx",
			args: ["-y", "tuquet-automa-cli@latest", ...baseArgs]
		};
	}

	public async executeCliCommand(args: string[]): Promise<any> {
		const cliPath = this.resolveCliPath();
		
		const argsStr = args.includes('--json') ? args.join(' ') : [...args, '--json'].join(' ');
		
		let execCmd = '';
		if (cliPath.startsWith('npx ')) {
			execCmd = `${cliPath} ${argsStr}`;
		} else {
			const cmd = cliPath.endsWith('.ts') ? 'npx tsx' : 'node';
			execCmd = `${cmd} "${cliPath}" ${argsStr}`;
		}
		
		const { stdout } = await execAsync(execCmd);
		return JSON.parse(stdout);
	}

	public async executeRawCliCommand(args: string[]): Promise<{stdout: string, stderr: string}> {
		const { cmd, args: finalArgs } = this.resolveCommandAndArgs(args);
		const commandStr = `${cmd} ${finalArgs.map(a => '"' + a.replace(/"/g, '\\"') + '"').join(' ')}`;
		const { stdout, stderr } = await execAsync(commandStr);
		return { stdout, stderr };
	}

	public getPort(): number {
		return this.port;
	}

	private async checkAutomaHealth(port: number): Promise<boolean> {
		try {
			const res = await fetch(`http://localhost:${port}/api/health`, { method: "GET" });
			if (res.ok) {
				const data = await res.json() as any;
				return data.status === "ok";
			}
		} catch (e) {
			// Ignore fetch errors (e.g. connection refused)
		}
		return false;
	}

	private async findAvailablePort(startPort: number): Promise<number> {
		const isPortAvailable = (port: number): Promise<boolean> => {
			return new Promise((resolve) => {
				const tester = net.createServer()
					.once('error', () => resolve(false))
					.once('listening', () => {
						tester.once('close', () => resolve(true)).close();
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
					Logger.info(`[Daemon] Automa Server is already running on port ${basePort}. Reusing existing process.`);
					this.hasLoggedReuse = true;
				}
				this.port = basePort;
				
				this.statusBarItem.text = `$(check) Automa: :${this.port}`;
				this.statusBarItem.tooltip = "Automa CLI Daemon is running externally (Click to ignore)";
				
				return;
			}

			// 1. Dynamic Port allocation if base port is occupied by something else
			this.port = await this.findAvailablePort(basePort);

			// 2. Smart CLI Resolve
			const cliPath = this.resolveCliPath();
			let cmd = "npx";
			let args = ["-y", "tuquet-automa-cli@latest", "serve", "--port", this.port.toString()];
			
			if (cliPath !== "npx tuquet-automa-cli") {
				cmd = "node";
				args = [cliPath, "serve", "--port", this.port.toString()];
				Logger.info(`[Smart Resolve] Found CLI at ${cliPath}`);
			}

			Logger.info(`Starting Automa background daemon on port ${this.port} via ${cmd} ${args.join(" ")}...`);
			
			const browserPathOverride = config.get<string>("browserPathOverride") || "";
			const env = { ...process.env };
			if (browserPathOverride) {
				env["AUTOMA_BROWSER_PATH"] = browserPathOverride;
			}

			this.daemonProcess = spawn(cmd, args, {
				shell: true,
				detached: false, 
				stdio: "pipe",
				env
			});

			if (this.daemonProcess.stdout) {
				this.daemonProcess.stdout.on("data", (data) => {
					const msg = data.toString().trim();
					if (msg) {
						// Stream CLI stdout to VS Code OutputChannel
						Logger.info(`[CLI Daemon] ${msg}`);
					}
				});
			}

			if (this.daemonProcess.stderr) {
				this.daemonProcess.stderr.on("data", (data) => {
					const msg = data.toString().trim();
					if (msg) {
						// Stream CLI stderr to VS Code OutputChannel
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
			
			// Wait a bit for server to start
			await new Promise(resolve => setTimeout(resolve, 2000));
			Logger.info("Automa background daemon started.");
			this.hasLoggedReuse = false;
			this.statusBarItem.text = `$(radio-tower) Automa: :${this.port}`;
			this.statusBarItem.tooltip = "Automa CLI Daemon is running (Click to stop)";
		} catch (e: any) {
			Logger.error(`Failed to launch daemon: ${e.message}`);
			this.updateStatusStopped();
		}
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
