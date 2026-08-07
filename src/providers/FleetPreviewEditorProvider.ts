import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { getErrorMessage } from "../utils/typeGuards";
import { BaseCustomEditorProvider } from "./BaseCustomEditorProvider";

export class FleetPreviewEditorProvider
	extends BaseCustomEditorProvider
	implements vscode.CustomTextEditorProvider
{
	public static readonly viewType = "automa.fleetPreview";

	public static register(context: vscode.ExtensionContext) {
		context.subscriptions.push(
			vscode.window.registerCustomEditorProvider(
				FleetPreviewEditorProvider.viewType,
				new FleetPreviewEditorProvider(context),
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
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.file(
					path.join(this.context.extensionPath, "src", "webview"),
				),
			],
		};

		let isRendered = false;
		let hasError = false;

		const renderWebview = () => {
			try {
				const content = document.getText();
				const json = JSON.parse(content || "{}");
				webviewPanel.title = `Fleet: ${json.name || json.fleet_id || path.basename(document.uri.fsPath)}`;
				webviewPanel.webview.html = this.getHtmlForWebview(
					webviewPanel.webview,
				);
				return true;
			} catch (error: unknown) {
				const e = getErrorMessage(error);
				webviewPanel.webview.html = `<body><h2>Error reading fleet</h2><p>${e}</p></body>`;
				return false;
			}
		};

		const updateWebview = async () => {
			if (!isRendered || hasError) {
				const success = renderWebview();
				hasError = !success;
				isRendered = true;
			} else {
				try {
					webviewPanel.webview.postMessage({
						type: "update",
						text: document.getText(),
					});
				} catch (_e: unknown) {
					// Ignore parse errors on external edits until fixed
				}
			}
		};

		// Listen to messages from webview
		webviewPanel.webview.onDidReceiveMessage(
			async (e: Record<string, unknown>) => {
				try {
					switch (e.type) {
						case "ready": {
							const workflows = await this.getWorkflowDictionary();
							const profiles = await this.getProfileDictionary();
							webviewPanel.webview.postMessage({
								type: "update",
								text: document.getText(),
								workflows: workflows,
								profiles: profiles,
							});
							break;
						}
						case "run-fleet":
							await vscode.commands.executeCommand(
								"automa.runFleet",
								document.uri,
							);
							break;
						case "stop-fleet":
							await vscode.commands.executeCommand(
								"automa.stopFleet",
								document.uri,
							);
							break;
						case "save-fleet":
							await this.saveDocument(document, e.data as string);
							break;
					}
					if (e.command === "error" || e.type === "error") {
						vscode.window.showErrorMessage(
							(e.text as string) || "Webview Error",
						);
					}
				} catch (error: unknown) {
					const err = getErrorMessage(error);
					vscode.window.showErrorMessage(`Fleet preview action failed: ${err}`);
				}
			},
		);

		this.setupWebviewPanel(document, webviewPanel, updateWebview);

		// Initial render
		await updateWebview();
	}

	private async buildDictionaryFromFiles(
		globPattern: string,
		extractItem: (
			json: Record<string, unknown>,
			filePath: string,
		) => { id?: string; name?: string } | undefined,
		errorContext: string,
	): Promise<Record<string, string>> {
		const dict: Record<string, string> = {};
		const parseErrors: string[] = [];
		try {
			const files = await vscode.workspace.findFiles(
				globPattern,
				"**/{node_modules,.git,dist,out,.gemini,tmp,build}/**",
			);
			await Promise.all(
				files.map(async (file) => {
					try {
						const content = await vscode.workspace.fs.readFile(file);
						const json = JSON.parse(Buffer.from(content).toString("utf8"));
						const item = extractItem(json, file.fsPath);
						if (item?.id && item.name) {
							dict[item.id] = item.name;
						}
					} catch (e: unknown) {
						const msg = getErrorMessage(e);
						parseErrors.push(`${path.basename(file.fsPath)}: ${msg}`);
					}
				}),
			);

			if (parseErrors.length > 0) {
				const limit = 3;
				const displayErrors = parseErrors.slice(0, limit).join(", ");
				const more =
					parseErrors.length > limit
						? ` and ${parseErrors.length - limit} more`
						: "";
				vscode.window.showWarningMessage(
					`Fleet Preview failed to parse ${parseErrors.length} file(s) for ${errorContext}: ${displayErrors}${more}`,
				);
			}
		} catch (e: unknown) {
			console.error(`Failed to scan ${errorContext}:`, e);
		}
		return dict;
	}

	private async getWorkflowDictionary(): Promise<Record<string, string>> {
		return this.buildDictionaryFromFiles(
			"**/*.workflow.json",
			(json) => {
				return json.id
					? { id: String(json.id), name: String(json.name) }
					: undefined;
			},
			"workflows",
		);
	}

	private async getProfileDictionary(): Promise<Record<string, string>> {
		return this.buildDictionaryFromFiles(
			"**/*.{profile,bprofile}.json",
			(json, filePath) => {
				return {
					id: String(
						json.id || path.basename(filePath, path.extname(filePath)),
					),
					name: String(
						json.name || path.basename(filePath, path.extname(filePath)),
					),
				};
			},
			"profiles",
		);
	}

	private getHtmlForWebview(_webview: vscode.Webview): string {
		const htmlPath = path.join(
			this.context.extensionPath,
			"src",
			"webview",
			"fleet-preview.html",
		);
		if (fs.existsSync(htmlPath)) {
			const html = fs.readFileSync(htmlPath, "utf-8");
			// Replace any standard vs-code assets if needed
			return html;
		}
		return `<!DOCTYPE html><html><body><h1>Error: fleet-preview.html not found</h1></body></html>`;
	}
}
