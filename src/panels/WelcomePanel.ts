import * as path from "path";
import * as vscode from "vscode";

export class WelcomePanel {
	public static currentPanel: WelcomePanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (WelcomePanel.currentPanel) {
			WelcomePanel.currentPanel._panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			"automaWelcome",
			"Welcome to Automa",
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, "webview-ui", "dist"),
				],
			},
		);

		WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		this._panel.onDidDispose(() => this.dispose(), null, []);
		this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

		this._panel.webview.onDidReceiveMessage(
			(message) => {
				switch (message.command) {
					case "installBrowser":
						vscode.commands.executeCommand("automa.installBrowser");
						return;
				}
			},
			null,
			[],
		);
	}

	public dispose() {
		WelcomePanel.currentPanel = undefined;
		this._panel.dispose();
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this._extensionUri,
				"webview-ui",
				"dist",
				"assets",
				"index.js",
			),
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this._extensionUri,
				"webview-ui",
				"dist",
				"assets",
				"index.css",
			),
		);

		return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Welcome to Automa</title>
            </head>
            <body>
                <div id="app"></div>
                <script type="module" src="${scriptUri}"></script>
            </body>
            </html>`;
	}
}
