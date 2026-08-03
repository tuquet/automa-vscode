import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";

export class BrowserProfileEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = "automa.bprofileEditor";

	constructor(private readonly context: vscode.ExtensionContext) {}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		webviewPanel.webview.options = { enableScripts: true };

		const updateWebview = () => {
			try {
				const content = document.getText();
				const json = JSON.parse(content || '{}');
				
				webviewPanel.title = `Profile: ${json.name || path.basename(document.uri.fsPath)}`;
				webviewPanel.webview.html = this.getHtmlContent(json);
			} catch (e: any) {
				webviewPanel.webview.html = `<body><h2>Error reading profile</h2><p>${e.message}</p></body>`;
			}
		};

		const messageDisposable = webviewPanel.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'save-profile') {
				try {
					const newJsonStr = message.data;
					
					const edit = new vscode.WorkspaceEdit();
					edit.replace(
						document.uri,
						new vscode.Range(0, 0, document.lineCount, 0),
						newJsonStr
					);
					await vscode.workspace.applyEdit(edit);
					await document.save();

					vscode.window.showInformationMessage("Browser Profile saved successfully!");
				} catch (e: any) {
					vscode.window.showErrorMessage("Failed to save profile: " + e.message);
				}
			}
		});

		const changeDocumentDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString()) {
				updateWebview();
			}
		});

		webviewPanel.onDidDispose(() => {
			messageDisposable.dispose();
			changeDocumentDisposable.dispose();
		});

		updateWebview();
	}

	private getHtmlContent(json: any): string {
		try {
			const htmlPath = path.join(this.context.extensionPath, "src", "webview", "bprofile-preview.html");
			let htmlContent = fs.readFileSync(htmlPath, "utf-8");

			const safeString = (str: any) => str ? String(str).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/<\/script>/gi, '<\\/script>') : '';

			htmlContent = htmlContent.replace("{{PROFILE_DATA}}", safeString(JSON.stringify(json, null, 2)));
			htmlContent = htmlContent.replace("{{PROFILE_NAME}}", safeString(json.name || 'Unknown Profile'));

			return htmlContent;
		} catch (error: any) {
			return `<body><h2>Error loading HTML template</h2><pre>${error.message}</pre></body>`;
		}
	}
}
