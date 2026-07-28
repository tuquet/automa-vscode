import * as vscode from "vscode";

export class TerminalManager {
	private static terminal: vscode.Terminal | null = null;
	private static logOutputChannel: vscode.OutputChannel | null = null;

	static getOrCreateTerminal(): vscode.Terminal {
		if (this.terminal === null) {
			this.terminal = vscode.window.createTerminal("Automa CLI");
			vscode.window.onDidCloseTerminal((t) => {
				if (t === this.terminal) {
					this.terminal = null;
				}
			});
		}
		this.terminal.show();
		return this.terminal;
	}

	static sendCommand(cmd: string): void {
		const t = this.getOrCreateTerminal();
		t.sendText(cmd);
	}

	static getOutputChannel(): vscode.OutputChannel {
		if (!this.logOutputChannel) {
			this.logOutputChannel = vscode.window.createOutputChannel(
				"Automa Execution Logs",
			);
		}
		return this.logOutputChannel;
	}

	static dispose(): void {
		this.terminal?.dispose();
		this.logOutputChannel?.dispose();
		this.terminal = null;
		this.logOutputChannel = null;
	}
}
