import * as vscode from "vscode";

export class Logger {
	private static outputChannel: vscode.OutputChannel | null = null;

	public static initialize(context: vscode.ExtensionContext) {
		if (!Logger.outputChannel) {
			Logger.outputChannel = vscode.window.createOutputChannel("Automa");
			context.subscriptions.push(Logger.outputChannel);
		}
	}

	public static getOutputChannel(): vscode.OutputChannel | null {
		return Logger.outputChannel;
	}

	public static info(message: string) {
		Logger.log("INFO", message);
	}

	public static warn(message: string) {
		Logger.log("WARN", message);
	}

	public static error(message: string) {
		Logger.log("ERROR", message);
	}

	public static debug(message: string) {
		Logger.log("DEBUG", message);
	}

	private static log(level: string, message: string) {
		if (Logger.outputChannel) {
			const timestamp = new Date().toISOString();
			Logger.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
		} else {
			console.log(`[${level}] ${message}`);
		}
	}
}
