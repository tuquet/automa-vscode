import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { BaseCustomEditorProvider } from "./BaseCustomEditorProvider";

interface AutomaJobLog {
	id: string;
	name?: string;
	status: string;
	created_at: string;
	workflow_id?: string;
	duration?: number;
	results?: Record<string, unknown>;
	[key: string]: unknown;
}

interface ParsedLogResponse {
	error?: string;
	job?: AutomaJobLog;
	logs?: Record<string, unknown>[];
	results?: Record<string, unknown>;
}

export class LogCustomEditorProvider
	extends BaseCustomEditorProvider
	implements vscode.CustomReadonlyEditorProvider
{
	public static readonly viewType = "automa.logEditor";

	public static register(context: vscode.ExtensionContext) {
		context.subscriptions.push(
			vscode.window.registerCustomEditorProvider(
				LogCustomEditorProvider.viewType,
				new LogCustomEditorProvider(context),
				{
					webviewOptions: {
						retainContextWhenHidden: true,
					},
					supportsMultipleEditorsPerDocument: false,
				},
			),
		);
	}

	public async openCustomDocument(
		uri: vscode.Uri,
		_openContext: vscode.CustomDocumentOpenContext,
		_token: vscode.CancellationToken,
	): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => {} };
	}

	private static async fetchLogFromDaemon(
		jobId: string,
	): Promise<ParsedLogResponse> {
		const { DaemonManager } = require("../core/DaemonManager");
		const daemon = DaemonManager.getInstance();

		try {
			const port = daemon.getPort();
			const res = await fetch(
				`http://localhost:${port}/api/jobs/${jobId}/details`,
			);
			if (!res.ok) throw new Error("Daemon not ready");
			return (await res.json()) as ParsedLogResponse;
		} catch (_err) {
			const { stdout } = await daemon.executeRawCliCommand([
				"log",
				jobId,
				"--json",
			]);
			return JSON.parse(stdout) as ParsedLogResponse;
		}
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
			const parsed = await LogCustomEditorProvider.fetchLogFromDaemon(jobId);

			if (parsed.error) {
				panel.webview.html = `<body><h2>Error</h2><pre>${parsed.error}</pre></body>`;
				return;
			}

			const job: AutomaJobLog = parsed.job || {
				name: "Unknown",
				id: jobId,
				status: "unknown",
				created_at: new Date().toISOString(),
			};
			const logs = parsed.logs || [];
			const results = parsed.results || { table: [], variables: {} };
			job.results = results;

			const provider = new LogCustomEditorProvider(context);
			panel.webview.html = provider.getWebviewContent(job, logs);
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			panel.webview.html = `<body><h2>Failed to load log</h2><pre>${e.message}</pre></body>`;
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
				const job: AutomaJobLog = parsed.job || {
					name: "Unknown Workflow",
					id: "N/A",
					status: "unknown",
					created_at: new Date().toISOString(),
				};
				const logs = parsed.logs || [];
				const results = parsed.results || { table: [], variables: {} };

				job.results = results;
				webviewPanel.webview.html = this.getWebviewContent(job, logs);
			} catch (error: unknown) {
				if (isInitial) {
					const e = error instanceof Error ? error : new Error(String(error));
					webviewPanel.webview.html = `
						<!DOCTYPE html>
						<html>
							<head><style>body{color:red; font-family:sans-serif; padding: 20px;}</style></head>
							<body>
								<h2>Failed to load Automa Log</h2>
								<pre>${e.message}</pre>
							</body>
						</html>
					`;
				}
				// If not initial, ignore parse errors (might be mid-write)
			}
		};

		this.setupWebviewPanel(document, webviewPanel, updateWebview);
	}
	private formatDate(dateString: string): string {
		if (!dateString) return "Unknown";
		try {
			const date = new Date(dateString);
			return date.toLocaleString("vi-VN", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
			});
		} catch {
			return "Unknown";
		}
	}

	private getStatusColor(status: string): string {
		if (status === "error" || status === "failed") return "text-vsc-error";
		if (status === "success") return "text-vsc-success";
		if (status === "stopped" || status === "stop") return "text-vsc-warning";
		return "text-vsc-fg";
	}

	private formatDuration(durationMs?: number): string {
		if (!durationMs) return "N/A";
		return durationMs < 1000
			? `${durationMs}ms`
			: `${(durationMs / 1000).toFixed(2)}s`;
	}

	private renderHtmlTemplate(
		job: AutomaJobLog,
		logsJson: string,
		jobJson: string,
	): string {
		const htmlPath = path.join(
			this.context.extensionPath,
			"src",
			"webview",
			"log-editor.html",
		);
		let htmlContent = fsSync.readFileSync(htmlPath, "utf-8");

		const jobName = job.name || "Unknown Job";
		htmlContent = htmlContent.replace("{{JOB_NAME}}", jobName);
		htmlContent = htmlContent.replace("{{JOB_NAME}}", jobName); // for title
		htmlContent = htmlContent.replace(
			"{{JOB_STATUS_COLOR}}",
			this.getStatusColor(job.status),
		);
		htmlContent = htmlContent.replace(
			"{{JOB_STATUS}}",
			job.status || "Unknown",
		);
		htmlContent = htmlContent.replace(
			"{{JOB_CREATED_AT}}",
			this.formatDate(job.created_at),
		);
		htmlContent = htmlContent.replace("{{JOB_ID}}", job.id || "N/A");
		htmlContent = htmlContent.replace(
			"{{WORKFLOW_ID}}",
			job.workflow_id || job.id || "N/A",
		);
		htmlContent = htmlContent.replace(
			"{{JOB_DURATION}}",
			this.formatDuration(job.duration),
		);

		const injectLogs = `const logsData = ${logsJson};`;
		const injectJob = `const jobData = ${jobJson};`;

		htmlContent = htmlContent.replace("{{INJECT_LOGS_DATA}}", injectLogs);
		htmlContent = htmlContent.replace("{{INJECT_JOB_DATA}}", injectJob);

		return htmlContent;
	}

	private getWebviewContent(
		job: AutomaJobLog,
		logs: Record<string, unknown>[],
	): string {
		const logsJson = JSON.stringify(logs).replace(/</g, "\\u003c");
		const jobJson = JSON.stringify(job).replace(/</g, "\\u003c");

		try {
			return this.renderHtmlTemplate(job, logsJson, jobJson);
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			return `<body><h2>Error loading HTML template</h2><pre>${e.message}</pre></body>`;
		}
	}
}
