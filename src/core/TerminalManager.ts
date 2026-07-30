import * as vscode from "vscode";

export class TerminalManager {
	private static terminal: vscode.Terminal | null = null;

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

	static dispose(): void {
		this.terminal?.dispose();
		this.terminal = null;
	}
}
