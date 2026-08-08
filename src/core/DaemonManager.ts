import type { ChildProcess } from "node:child_process";
import { DaemonProcessController } from "./DaemonProcessController";

export class DaemonManager {
	private static instance: DaemonManager;
	private controller: DaemonProcessController;

	private constructor() {
		this.controller = new DaemonProcessController();
	}

	public static getInstance(): DaemonManager {
		if (!DaemonManager.instance) {
			DaemonManager.instance = new DaemonManager();
		}
		return DaemonManager.instance;
	}

	public get daemonProcess(): ChildProcess | null {
		return this.controller.daemonProcess;
	}

	public isRunning(): boolean {
		return this.controller.isRunning();
	}

	public resolveCliPath(extensionPath?: string): string {
		return this.controller.resolveCliPath(extensionPath);
	}

	public resolveCommandAndArgs(baseArgs: string[]): {
		cmd: string;
		args: string[];
	} {
		return this.controller.resolveCommandAndArgs(baseArgs);
	}

	public async executeCliCommand(args: string[]): Promise<unknown> {
		return this.controller.executeCliCommand(args);
	}

	public async executeRawCliCommand(
		args: string[],
	): Promise<{ stdout: string; stderr: string }> {
		return this.controller.executeRawCliCommand(args);
	}

	public getPort(): number {
		return this.controller.getPort();
	}

	public async start(): Promise<void> {
		return this.controller.start();
	}

	public stop(): void {
		this.controller.stop();
	}
}
