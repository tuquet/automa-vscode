import * as fs from "node:fs";
import * as vscode from "vscode";
import { Logger } from "../core/Logger";

export class StudioWebviewPanel {
	public static currentPanel: StudioWebviewPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview (EnvironmentAdapter)
		this._panel.webview.onDidReceiveMessage(
			(message) => {
				switch (message.type) {
					case "runtime-message":
						this.handleRuntimeMessage(message.data).then((result) => {
							this._panel.webview.postMessage({
								type: "runtime-message-response",
								id: message.id,
								data: result,
							});
						});
						break;
					case "storage-get":
						this.handleStorageGet(message.keys).then((data) => {
							this._panel.webview.postMessage({
								type: "storage-get-response",
								id: message.id,
								data,
							});
						});
						break;
					case "storage-set":
						this.handleStorageSet(message.data).then(() => {
							this._panel.webview.postMessage({
								type: "storage-set-response",
								id: message.id,
							});
						});
						break;
					case "error":
						Logger.error(`WEBVIEW ERROR: ${message.data}`);
						break;
				}
			},
			null,
			this._disposables,
		);
	}

	public static createOrShow(extensionUri: vscode.Uri, _fileUri?: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (StudioWebviewPanel.currentPanel) {
			StudioWebviewPanel.currentPanel._panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			"automaStudio",
			"Automa Studio",
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, "webview-ui", "dist"),
				],
			},
		);

		StudioWebviewPanel.currentPanel = new StudioWebviewPanel(
			panel,
			extensionUri,
		);
		StudioWebviewPanel.currentPanel._update();
	}

	private async handleRuntimeMessage(message: unknown): Promise<unknown> {
		if (!message || typeof message !== "object" || !("name" in message))
			return null;
		const msgName = (message as { name: string }).name;
		const msgData = (message as { data?: unknown }).data;

		try {
			switch (msgName) {
				case "background--fetch":
				case "background--fetch:text": {
					let url = "";
					let options: Record<string, unknown> = {};

					if (typeof msgData === "string") {
						url = msgData;
					} else if (
						msgData &&
						typeof msgData === "object" &&
						"resource" in msgData
					) {
						const resource = (
							msgData as { resource: Record<string, unknown> | string }
						).resource;
						url =
							typeof resource === "string"
								? resource
								: String(resource.url || "");
						options = resource as Record<string, unknown>;
					}

					if (!url) throw new Error("Fetch URL missing");

					const res = await fetch(url, options);
					if (!res.ok) throw new Error(`HTTP error ${res.status}`);

					if (msgName === "background--fetch:text") {
						return await res.text();
					}

					const msgDataType =
						msgData && typeof msgData === "object" && "type" in msgData
							? (msgData as { type: string }).type
							: "json";
					if (msgDataType === "json") return await res.json();
					if (msgDataType === "text") return await res.text();

					// base64 handling for images
					if (msgDataType === "base64") {
						const buffer = await res.arrayBuffer();
						return Buffer.from(buffer).toString("base64");
					}

					return await res.text();
				}

				case "background--workflow:execute": {
					const { DaemonManager } = require("../core/DaemonManager");
					const daemon = DaemonManager.getInstance();

					const workflowData =
						msgData && typeof msgData === "object" && "workflowData" in msgData
							? (msgData as { workflowData: unknown }).workflowData
							: msgData;
					if (
						!workflowData ||
						typeof workflowData !== "object" ||
						!("id" in workflowData)
					)
						return { success: false, error: "Missing workflow ID" };

					try {
						const port = daemon.getPort();
						const executeUrl = `http://localhost:${port}/api/jobs/run`;
						const reqOptions =
							(msgData && typeof msgData === "object" && "options" in msgData
								? (msgData as { options: Record<string, unknown> }).options
								: {}) || {};
						if (
							!reqOptions.vaultPath &&
							vscode.workspace.workspaceFolders?.length
						) {
							reqOptions.vaultPath =
								vscode.workspace.workspaceFolders[0].uri.fsPath;
						}

						const res = await fetch(executeUrl, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								workflowData,
								options: reqOptions,
							}),
						});

						if (!res.ok) {
							const errBody = await res.json().catch(() => ({}));
							const errMsg =
								(errBody as { error?: string }).error ||
								`Daemon responded with ${res.status}`;
							return { success: false, error: errMsg };
						}

						return await res.json();
					} catch (_error: unknown) {
						// Daemon unreachable, fallback to CLI
						try {
							const result = await daemon.executeCliCommand([
								"run",
								(workflowData as { id: string }).id,
							]);
							return result;
						} catch (cliErr: unknown) {
							const errMsg =
								cliErr instanceof Error ? cliErr.message : String(cliErr);
							Logger.error(`Workflow execution failed: ${errMsg}`);
							return { success: false, error: errMsg };
						}
					}
				}

				case "background--open:dashboard": {
					Logger.info(`Open Dashboard requested: ${String(msgData)}`);
					return true;
				}

				default:
					Logger.info(`Unhandled runtime message: ${msgName}`);
					return null;
			}
		} catch (e: unknown) {
			Logger.error(
				`Runtime Message Error [${msgName}]: ${e instanceof Error ? e.message : String(e)}`,
			);
			return null;
		}
	}

	private async handleStorageGet(
		_keys: unknown,
	): Promise<Record<string, unknown>> {
		const result: Record<string, unknown> = {};
		const EXCLUDE_PATTERN =
			"**/{node_modules,.git,dist,out,.gemini,tmp,build}/**";

		try {
			const [workflowFiles, variableFiles, credentialFiles, tableFiles] =
				await Promise.all([
					vscode.workspace.findFiles("**/*.workflow.json", EXCLUDE_PATTERN),
					vscode.workspace.findFiles("**/*.variable.json", EXCLUDE_PATTERN),
					vscode.workspace.findFiles("**/*.credential.json", EXCLUDE_PATTERN),
					vscode.workspace.findFiles("**/*.table.json", EXCLUDE_PATTERN),
				]);

			const parseErrors: string[] = [];
			const readJsonFiles = async (
				files: vscode.Uri[],
				shouldSanitize = false,
			) => {
				const { DaemonManager } = require("../core/DaemonManager");
				const daemon = DaemonManager.getInstance();
				const port = daemon.getPort();
				const contents = await Promise.all(
					files.map(async (file) => {
						try {
							const bytes = await vscode.workspace.fs.readFile(file);
							return JSON.parse(Buffer.from(bytes).toString("utf-8"));
						} catch (e: unknown) {
							const msg = e instanceof Error ? e.message : String(e);
							const path = require("node:path");
							parseErrors.push(`${path.basename(file.fsPath)}: ${msg}`);
							return null;
						}
					}),
				);

				let validParsed = contents.filter((item) => item !== null);

				if (shouldSanitize && validParsed.length > 0) {
					try {
						const res = await fetch(
							`http://localhost:${port}/api/sanitize/batch`,
							{
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ workflows: validParsed }),
							},
						);
						if (res.ok) {
							const data = (await res.json()) as {
								success: boolean;
								data: Record<string, unknown>[];
							};
							if (data.success && data.data) {
								validParsed = data.data;
							}
						}
					} catch (_e: unknown) {
						// Ignore fetch error, just use un-sanitized data
					}
				}

				return validParsed;
			};

			const [workflows, rawVars, rawCreds, rawTables] = await Promise.all([
				readJsonFiles(workflowFiles, true),
				readJsonFiles(variableFiles),
				readJsonFiles(credentialFiles),
				readJsonFiles(tableFiles),
			]);

			if (parseErrors.length > 0) {
				const limit = 3;
				const displayErrors = parseErrors.slice(0, limit).join(", ");
				const more =
					parseErrors.length > limit
						? ` and ${parseErrors.length - limit} more`
						: "";
				vscode.window.showWarningMessage(
					`Studio Webview failed to parse ${parseErrors.length} file(s): ${displayErrors}${more}`,
				);
			}

			result.workflows = workflows;
			result.variables = rawVars.flat();
			result.credentials = rawCreds.flat();
			result.tables = rawTables.flat();
			result.workflowStates = {}; // Initial state
		} catch (e: unknown) {
			Logger.error(
				`Failed to fetch storage get: ${e instanceof Error ? e.message : String(e)}`,
			);
		}

		return result;
	}

	private async handleStorageSet(items: Record<string, unknown>) {
		if (
			!vscode.workspace.workspaceFolders ||
			vscode.workspace.workspaceFolders.length === 0
		)
			return;
		const workspaceRoot = vscode.workspace.workspaceFolders[0].uri;
		const EXCLUDE_PATTERN =
			"**/{node_modules,.git,dist,out,.gemini,tmp,build}/**";
		const parseErrors: string[] = [];

		try {
			if (items.workflows && Array.isArray(items.workflows)) {
				const allFiles = await vscode.workspace.findFiles(
					"**/*.workflow.json",
					EXCLUDE_PATTERN,
				);

				const idToUriMap = new Map<string, vscode.Uri>();
				await Promise.all(
					allFiles.map(async (file) => {
						try {
							const content = await vscode.workspace.fs.readFile(file);
							const data = JSON.parse(Buffer.from(content).toString("utf-8"));
							if (data.id) {
								idToUriMap.set(data.id, file);
							}
						} catch (e: unknown) {
							const msg = e instanceof Error ? e.message : String(e);
							const path = require("node:path");
							parseErrors.push(`${path.basename(file.fsPath)}: ${msg}`);
						}
					}),
				);

				for (const wf of items.workflows) {
					if (!wf || typeof wf !== "object" || !("id" in wf)) continue;
					const wfObj = wf as { id: string; name?: string };
					if (!wfObj.id) continue;

					let targetUri = idToUriMap.get(wfObj.id);
					if (!targetUri) {
						const safeName = (wfObj.name || wfObj.id)
							.replace(/[^a-z0-9]/gi, "_")
							.toLowerCase();
						targetUri = vscode.Uri.joinPath(
							workspaceRoot,
							"workflows",
							`${safeName}.workflow.json`,
						);
					}

					await vscode.workspace.fs.writeFile(
						targetUri,
						Buffer.from(JSON.stringify(wf, null, 2), "utf-8"),
					);
				}
			}

			if (items.variables && Array.isArray(items.variables)) {
				await this.saveGroupedData(
					workspaceRoot,
					items.variables,
					"**/*.variable.json",
					"studio.variable.json",
					"variables",
					EXCLUDE_PATTERN,
					parseErrors,
				);
			}

			if (items.credentials && Array.isArray(items.credentials)) {
				await this.saveGroupedData(
					workspaceRoot,
					items.credentials,
					"**/*.credential.json",
					"studio.credential.json",
					"credentials",
					EXCLUDE_PATTERN,
					parseErrors,
				);
			}

			if (items.tables && Array.isArray(items.tables)) {
				await this.saveGroupedData(
					workspaceRoot,
					items.tables,
					"**/*.table.json",
					"studio.table.json",
					"tables",
					EXCLUDE_PATTERN,
					parseErrors,
				);
			}

			if (parseErrors.length > 0) {
				const limit = 3;
				const displayErrors = parseErrors.slice(0, limit).join(", ");
				const more =
					parseErrors.length > limit
						? ` and ${parseErrors.length - limit} more`
						: "";
				vscode.window.showWarningMessage(
					`Studio Webview failed to parse ${parseErrors.length} file(s) during save: ${displayErrors}${more}`,
				);
			}
		} catch (error: unknown) {
			const e = error instanceof Error ? error.message : String(error);
			Logger.error(`Failed to handle storage set: ${e}`);
		}
	}

	private async saveGroupedData(
		workspaceRoot: vscode.Uri,
		itemsList: unknown[],
		globPattern: string,
		defaultFileName: string,
		folderName: string,
		excludePattern: string,
		parseErrors: string[],
	) {
		const allFiles = await vscode.workspace.findFiles(
			globPattern,
			excludePattern,
		);

		const idToUriMap = new Map<string, vscode.Uri>();
		const uriToItemsMap = new Map<string, Record<string, unknown>[]>();

		for (const file of allFiles) {
			try {
				const content = await vscode.workspace.fs.readFile(file);
				const data = JSON.parse(Buffer.from(content).toString("utf-8"));
				const arr = Array.isArray(data) ? data : [];
				uriToItemsMap.set(file.toString(), arr);
				for (const item of arr) {
					if (item && typeof item === "object" && "id" in item)
						idToUriMap.set(item.id as string, file);
				}
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : String(e);
				const path = require("node:path");
				parseErrors.push(`${path.basename(file.fsPath)}: ${msg}`);
			}
		}

		for (const rawItem of itemsList) {
			const item = rawItem as Record<string, unknown>;
			if (!item?.id) continue;
			let targetUri = idToUriMap.get(item.id as string);
			if (!targetUri) {
				targetUri = vscode.Uri.joinPath(
					workspaceRoot,
					folderName,
					defaultFileName,
				);
			}

			let itemsInFile = uriToItemsMap.get(targetUri.toString());
			if (!itemsInFile) {
				itemsInFile = [];
				uriToItemsMap.set(targetUri.toString(), itemsInFile);
			}

			const existingIdx = itemsInFile.findIndex((x) => x.id === item.id);
			if (existingIdx !== -1) {
				itemsInFile[existingIdx] = item;
			} else {
				itemsInFile.push(item);
			}
		}

		for (const [uriStr, arr] of uriToItemsMap.entries()) {
			await vscode.workspace.fs.writeFile(
				vscode.Uri.parse(uriStr),
				Buffer.from(JSON.stringify(arr, null, 2), "utf-8"),
			);
		}
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const indexPath = vscode.Uri.joinPath(
			this._extensionUri,
			"webview-ui",
			"dist",
			"index.html",
		).fsPath;
		let html = fs.readFileSync(indexPath, "utf-8");

		const distUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, "webview-ui", "dist"),
		);

		// Inject VSCode Webview URIs for static assets
		html = html.replace(/src="([^"]+\.js)"/g, (_match, p1) => {
			return `src="${distUri}/${p1}"`;
		});

		html = html.replace(/href="([^"]+\.css)"/g, (_match, p1) => {
			return `href="${distUri}/${p1}"`;
		});

		// Inject error capturing script, asset base url, and VSCode API initialization
		const initScript = `
        <script>
            window.ASSETS_BASE_URL = "${distUri}/";
            window.vscodeApi = acquireVsCodeApi();
            window.onerror = function(message, source, lineno, colno, error) {
                window.vscodeApi.postMessage({ type: 'error', data: message + ' at ' + source + ':' + lineno });
            };
            window.addEventListener('unhandledrejection', function(event) {
                window.vscodeApi.postMessage({ type: 'error', data: 'Unhandled Rejection: ' + (event.reason ? (event.reason.stack || event.reason.message || event.reason) : 'Unknown') });
            };
            const originalError = console.error;
            console.error = function(...args) {
                window.vscodeApi.postMessage({ type: 'error', data: args.join(' ') });
                originalError.apply(console, args);
            };
            const originalWarn = console.warn;
            console.warn = function(...args) {
                window.vscodeApi.postMessage({ type: 'error', data: args.join(' ') });
                originalWarn.apply(console, args);
            };
        </script>
        `;
		html = html.replace("<head>", `<head>${initScript}`);

		return html;
	}

	public dispose() {
		StudioWebviewPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}
}
