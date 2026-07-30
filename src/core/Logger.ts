import * as vscode from "vscode";

export class Logger {
	private static outputChannel: vscode.OutputChannel | null = null;

	public static initialize(context: vscode.ExtensionContext) {
		if (!this.outputChannel) {
			this.outputChannel = vscode.window.createOutputChannel("Automa Execution Logs");
			context.subscriptions.push(this.outputChannel);
		}
	}

	public static getOutputChannel(): vscode.OutputChannel | null {
		return this.outputChannel;
	}

	public static info(message: string) {
		this.log("INFO", message);
	}

	public static warn(message: string) {
		this.log("WARN", message);
	}

	public static error(message: string) {
		this.log("ERROR", message);
	}

	private static log(level: string, message: string) {
		if (this.outputChannel) {
			const timestamp = new Date().toISOString();
			this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
		} else {
			console.log(`[${level}] ${message}`);
		}
	}
}
