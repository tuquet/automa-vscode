import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { BaseCustomEditorProvider } from "./BaseCustomEditorProvider";

export class BrowserProfileEditorProvider
	extends BaseCustomEditorProvider
	implements vscode.CustomTextEditorProvider
{
	public static readonly viewType = "automa.browserProfileEditor";

	public static register(context: vscode.ExtensionContext) {
		context.subscriptions.push(
			vscode.window.registerCustomEditorProvider(
				BrowserProfileEditorProvider.viewType,
				new BrowserProfileEditorProvider(context),
				{
					webviewOptions: {
						retainContextWhenHidden: true,
					},
					supportsMultipleEditorsPerDocument: false,
				},
			),
		);
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		const updateWebview = () => {
			this.renderWebview(document, webviewPanel);
		};

		const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
			async (message) => {
				if (message.type === "save-profile") {
					await this.handleSaveProfile(document, message.data);
				}
				if (message.command === "error" || message.type === "error") {
					vscode.window.showErrorMessage(message.text || "Webview Error");
				}
			},
		);

		this.setupWebviewPanel(document, webviewPanel, updateWebview, [
			messageDisposable,
		]);

		updateWebview();
	}

	private renderWebview(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
	) {
		try {
			const content = document.getText();
			const json = JSON.parse(content || "{}");

			const fileName = path.basename(document.uri.fsPath);
			const isProfile =
				fileName.includes(".profile.") || fileName.includes(".bprofile.");
			const isTable = fileName.includes(".table.");
			const label = isProfile ? "Profile" : "Data";
			const icon = isProfile ? "ri-window-line" : "ri-database-2-line";
			webviewPanel.title = `${label}: ${json.name || fileName}`;
			webviewPanel.webview.html = this.getHtmlContent(
				json,
				label,
				icon,
				fileName,
				isTable,
			);
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			webviewPanel.webview.html = `<body><h2>Error reading profile</h2><p>${e.message}</p></body>`;
		}
	}

	private async handleSaveProfile(
		document: vscode.TextDocument,
		newJsonStr: string,
	) {
		try {
			await this.saveDocument(document, newJsonStr);

			vscode.window.showInformationMessage(
				"Browser Profile saved successfully!",
			);
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			vscode.window.showErrorMessage(`Failed to save profile: ${e.message}`);
		}
	}

	private getHtmlContent(
		json: Record<string, unknown>,
		label: string,
		icon: string,
		fileName: string,
		isTable: boolean = false,
	): string {
		try {
			const htmlPath = path.join(
				this.context.extensionPath,
				"src",
				"webview",
				"bprofile-preview.html",
			);
			let htmlContent = fs.readFileSync(htmlPath, "utf-8");

			const safeString = (str: unknown) =>
				str
					? String(str)
							.replace(/\\/g, "\\\\")
							.replace(/`/g, "\\`")
							.replace(/\$\{/g, "\\${")
							.replace(/<\/script>/gi, "<\\/script>")
					: "";

			htmlContent = htmlContent.replace(
				"{{PROFILE_DATA}}",
				safeString(JSON.stringify(json, null, 2)),
			);
			htmlContent = htmlContent.replace(
				"{{PROFILE_NAME}}",
				safeString(json.name || fileName),
			);
			htmlContent = htmlContent.replace("{{LABEL}}", label);
			htmlContent = htmlContent.replace("{{ICON}}", icon);
			htmlContent = htmlContent.replace(
				"{{IS_TABLE}}",
				isTable ? "true" : "false",
			);

			return htmlContent;
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			return `<body><h2>Error loading HTML template</h2><pre>${e.message}</pre></body>`;
		}
	}
}
