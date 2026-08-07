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
		const telemetryListener = (telemetry: any) => {
			webviewPanel.webview.postMessage({
				type: "telemetry",
				data: telemetry,
			});
		};

		TaskRunner.telemetryEmitter.on("telemetry", telemetryListener);

		// Listen to messages from webview
		webviewPanel.webview.onDidReceiveMessage((e) => {
			switch (e.type) {
				case "ready":
					updateWebview();
					break;
				case "run-fleet":
					vscode.commands.executeCommand("automa.runFleet", document.uri);
					break;
				case "stop-fleet":
					vscode.commands.executeCommand("automa.stopFleet", document.uri);
					break;
				case "save-fleet":
					this.saveDocument(document, e.data);
					break;
			}
		});

		this.setupWebviewPanel(document, webviewPanel, updateWebview, [
			{
				dispose: () =>
					TaskRunner.telemetryEmitter.off("telemetry", telemetryListener),
			},
		]);
	}

	private async getWorkflowDictionary(): Promise<Record<string, string>> {
		const dict: Record<string, string> = {};
		try {
			const files = await vscode.workspace.findFiles(
				"**/*.workflow.json",
				"**/node_modules/**",
			);
			for (const file of files) {
				try {
					const content = await vscode.workspace.fs.readFile(file);
					const json = JSON.parse(Buffer.from(content).toString("utf8"));
					if (json.id && json.name) {
						dict[json.id] = json.name;
					}
				} catch (_e) {
					// Ignore parse errors for individual files
				}
			}
		} catch (e) {
			console.error("Failed to scan workflows:", e);
		}
		return dict;
	}

	private async getProfileDictionary(): Promise<Record<string, string>> {
		const dict: Record<string, string> = {};
		try {
			const files = await vscode.workspace.findFiles(
				"**/*.profile.json",
				"**/node_modules/**",
			);
			for (const file of files) {
				try {
					const content = await vscode.workspace.fs.readFile(file);
					const json = JSON.parse(Buffer.from(content).toString("utf8"));
					const id =
						json.id || path.basename(file.fsPath, path.extname(file.fsPath));
					const name = json.name || id;
					dict[id] = name;
				} catch (_e) {
					// Ignore parse errors
				}
			}
		} catch (e) {
			console.error("Failed to scan profiles:", e);
		}
		return dict;
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
