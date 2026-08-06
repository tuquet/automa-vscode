import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { BaseCustomEditorProvider } from "./BaseCustomEditorProvider";

export class LogCustomEditorProvider
	extends BaseCustomEditorProvider
	implements vscode.CustomReadonlyEditorProvider
{
	public static readonly viewType = "automa.logEditor";

	public async openCustomDocument(
		uri: vscode.Uri,
		_openContext: vscode.CustomDocumentOpenContext,
		_token: vscode.CancellationToken,
	): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => {} };
	}

	public static async showLogForJobId(
		context: vscode.ExtensionContext,
		jobId: string,
	) {
		const panel = vscode.window.createWebviewPanel(
			LogCustomEditorProvider.viewType,
			`Log: ${jobId}`,
			vscode.ViewColumn.Active,
			{ enableScripts: true },
		);

		panel.webview.html = `
			<!DOCTYPE html>
			<html>
				<head><style>body{color:#ccc; font-family:sans-serif; padding: 20px;}</style></head>
				<body><h2>Loading Log Data for ${jobId}...</h2></body>
			</html>
		`;

		try {
			const { DaemonManager } = require("../core/DaemonManager");
			const { stdout, stderr } =
				await DaemonManager.getInstance().executeRawCliCommand([
					"log",
					jobId,
					"--json",
				]);
			const parsed = JSON.parse(stdout);

			if (parsed.error) {
				panel.webview.html = `<body><h2>Error</h2><pre>${parsed.error}</pre></body>`;
				return;
			}

			const job = parsed.job || {
				name: "Unknown",
				id: jobId,
				status: "unknown",
			};
			const logs = parsed.logs || [];
			const results = parsed.results || { table: [], variables: {} };
			job.results = results;

			const provider = new LogCustomEditorProvider(context);
			panel.webview.html = provider.getWebviewContent(job, logs);
		} catch (error: any) {
			panel.webview.html = `<body><h2>Failed to load log</h2><pre>${error.message}</pre></body>`;
		}
	}

	public async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		let isFirstLoad = true;
		const updateWebview = async () => {
			const isInitial = isFirstLoad;
			isFirstLoad = false;
			try {
				const content = await fs.readFile(document.uri.fsPath, "utf-8");
				const parsed = JSON.parse(content);
				const job = parsed.job || {
					name: "Unknown Workflow",
					id: "N/A",
					status: "unknown",
				};
				const logs = parsed.logs || [];
				const results = parsed.results || { table: [], variables: {} };

				job.results = results;
				webviewPanel.webview.html = this.getWebviewContent(job, logs);
			} catch (error: any) {
				if (isInitial) {
					webviewPanel.webview.html = `
						<!DOCTYPE html>
						<html>
							<head><style>body{color:red; font-family:sans-serif; padding: 20px;}</style></head>
							<body>
								<h2>Failed to load Automa Log</h2>
								<pre>${error.message}</pre>
							</body>
						</html>
					`;
				}
				// If not initial, ignore parse errors (might be mid-write)
			}
		};

		this.setupWebviewPanel(document, webviewPanel, updateWebview);
	}
	private getWebviewContent(job: any, logs: any[]): string {
		// Prepare data to send to webview
		const logsJson = JSON.stringify(logs).replace(/</g, "\\u003c");
		const jobJson = JSON.stringify(job).replace(/</g, "\\u003c");

		// Format created_at nicely
		let formattedCreated = job.created_at;
		if (job.created_at) {
			try {
				const date = new Date(job.created_at);
				formattedCreated = date.toLocaleString("vi-VN", {
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
				});
			} catch (_e) {}
		}

		let jobStatusColor = "text-vsc-fg";
		if (job.status === "error" || job.status === "failed")
			jobStatusColor = "text-vsc-error";
		else if (job.status === "success") jobStatusColor = "text-vsc-success";
		else if (job.status === "stopped" || job.status === "stop")
			jobStatusColor = "text-vsc-warning";

		try {
			const htmlPath = path.join(
				this.context.extensionPath,
				"src",
				"webview",
				"log-editor.html",
			);
			let htmlContent = fsSync.readFileSync(htmlPath, "utf-8");

			htmlContent = htmlContent.replace(
				"{{JOB_NAME}}",
				job.name || "Unknown Job",
			);
			htmlContent = htmlContent.replace(
				"{{JOB_NAME}}",
				job.name || "Unknown Job",
			); // for title
			htmlContent = htmlContent.replace("{{JOB_STATUS_COLOR}}", jobStatusColor);
			htmlContent = htmlContent.replace(
				"{{JOB_STATUS}}",
				job.status || "Unknown",
			);
			htmlContent = htmlContent.replace(
				"{{JOB_CREATED_AT}}",
				formattedCreated || "Unknown",
			);
			htmlContent = htmlContent.replace("{{JOB_ID}}", job.id || "N/A");
			htmlContent = htmlContent.replace(
				"{{WORKFLOW_ID}}",
				job.workflow_id || job.id || "N/A",
			);

			let durationText = "N/A";
			if (job.duration) {
				durationText =
					job.duration < 1000
						? `${job.duration}ms`
						: `${(job.duration / 1000).toFixed(2)}s`;
			}
			htmlContent = htmlContent.replace("{{JOB_DURATION}}", durationText);

			const injectLogs = `const logsData = ${logsJson};`;
			const injectJob = `const jobData = ${jobJson};`;

			htmlContent = htmlContent.replace("{{INJECT_LOGS_DATA}}", injectLogs);
			htmlContent = htmlContent.replace("{{INJECT_JOB_DATA}}", injectJob);

			return htmlContent;
		} catch (error: any) {
			return `<body><h2>Error loading HTML template</h2><pre>${error.message}</pre></body>`;
		}
	}
}
