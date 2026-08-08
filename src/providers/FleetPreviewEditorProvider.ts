import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";
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

		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		const updateWebview = async () => {
			const workflows = await this.getWorkflowDictionary();
			const profiles = await this.getProfileDictionary();
			webviewPanel.webview.postMessage({
				type: "update",
				text: document.getText(),
				workflows: workflows,
				profiles: profiles,
			});
		};

		// Listen to telemetry
		const telemetryListener = (telemetry: unknown) => {
			webviewPanel.webview.postMessage({
				type: "telemetry",
				data: telemetry,
			});
		};

		TaskRunner.telemetryEmitter.on("telemetry", telemetryListener);

		// Listen to messages from webview
		webviewPanel.webview.onDidReceiveMessage(async (e) => {
			switch (e.type) {
				case "ready":
					updateWebview();
					break;
				case "run-fleet":
					await vscode.commands.executeCommand("automa.runFleet", document.uri);
					break;
				case "stop-fleet":
					await vscode.commands.executeCommand(
						"automa.stopFleet",
						document.uri,
					);
					break;
				case "save-fleet":
					await this.saveDocument(document, e.data);
					break;
			}
			if (e.command === "error" || e.type === "error") {
				vscode.window.showErrorMessage(e.text || "Webview Error");
			}
		});

		this.setupWebviewPanel(document, webviewPanel, updateWebview, [
			{
				dispose: () =>
					TaskRunner.telemetryEmitter.off("telemetry", telemetryListener),
			},
		]);
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
						const msg = e instanceof Error ? e.message : String(e);
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
				if (
					((json as Record<string, unknown>).id as string) &&
					((json as Record<string, unknown>).name as string)
				) {
					return {
						id: (json as Record<string, unknown>).id as string,
						name: (json as Record<string, unknown>).name as string,
					};
				}
				return undefined;
			},
			"workflows",
		);
	}

	private async getProfileDictionary(): Promise<Record<string, string>> {
		return this.buildDictionaryFromFiles(
			"**/*.{profile,bprofile}.json",
			(json, filePath) => {
				const id =
					((json as Record<string, unknown>).id as string) ||
					path.basename(filePath, path.extname(filePath));
				const name = ((json as Record<string, unknown>).name as string) || id;
				return { id, name };
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
