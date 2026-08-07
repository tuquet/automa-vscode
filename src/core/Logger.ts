import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | null = null;

function logMessage(level: string, message: string) {
	if (outputChannel) {
		const timestamp = new Date().toISOString();
		outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
	} else {
		console.log(`[${level}] ${message}`);
	}
}

export const Logger = {
	initialize(context: vscode.ExtensionContext) {
		if (!outputChannel) {
			outputChannel = vscode.window.createOutputChannel("Automa");
			context.subscriptions.push(outputChannel);
		}
	},

	getOutputChannel(): vscode.OutputChannel | null {
		return outputChannel;
	},

	info(message: string) {
		logMessage("INFO", message);
	},

	warn(message: string) {
		logMessage("WARN", message);
	},

	error(message: string) {
		logMessage("ERROR", message);
	},

	debug(message: string) {
		logMessage("DEBUG", message);
	},
};
