import * as fs from "node:fs";
import * as vscode from "vscode";
import { Logger } from "../core/Logger";
import {
	castRecord,
	getErrorMessage,
	isRecord,
	isString,
	toError,
} from "../utils/typeGuards";

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
			(message: Record<string, unknown>) => {
				switch (message.type) {
					case "runtime-message":
						this.handleRuntimeMessage(message.data as Record<string, unknown>)
							.then((result) => {
								this._panel.webview.postMessage({
									type: "runtime-message-response",
									id: message.id,
									data: result,
								});
							})
							.catch((e: unknown) =>
								Logger.error(`Failed to post runtime-message-response: ${e}`),
							);
						break;
					case "storage-get":
						this.handleStorageGet(message.keys)
							.then((data) => {
								this._panel.webview.postMessage({
									type: "storage-get-response",
									id: message.id,
									data,
								});
							})
							.catch((e: unknown) =>
								Logger.error(`Failed to post storage-get-response: ${e}`),
							);
						break;
					case "storage-set":
						this.handleStorageSet(message.data)
							.then(() => {
								this._panel.webview.postMessage({
									type: "storage-set-response",
									id: message.id,
								});
							})
							.catch((e: unknown) =>
								Logger.error(`Failed to post storage-set-response: ${e}`),
							);
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

	private async handleRuntimeMessage(
		message: Record<string, unknown>,
	): Promise<unknown> {
		if (!message?.name) return null;

		try {
			switch (message.name) {
				case "background--fetch":
				case "background--fetch:text": {
					let url = "";
					let options: Record<string, unknown> = {};

					if (isString(message.data)) {
						url = message.data;
					} else if (castRecord(message.data)?.resource) {
						const res = castRecord(castRecord(message.data).resource);
						url = (res.url as string) || (res as unknown as string);
						options = res;
					}

					if (!url) throw new Error("Fetch URL missing");

					const res = await fetch(url, options);
					if (!res.ok) throw new Error(`HTTP error ${res.status}`);

					if (message.name === "background--fetch:text") {
						return await res.text();
					}

					const type = castRecord(message.data)?.type || "json";
					if (type === "json") return await res.json();
					if (type === "text") return await res.text();

					// base64 handling for images
					if (type === "base64") {
						const buffer = await res.arrayBuffer();
						return Buffer.from(buffer).toString("base64");
					}

					return await res.text();
				}

				case "background--workflow:execute": {
					const { DaemonManager } = require("../core/DaemonManager");
					const daemon = DaemonManager.getInstance();

					const workflowData =
						castRecord(message.data)?.workflowData || message.data;
					if (!castRecord(workflowData)?.id)
						return { success: false, error: "Missing workflow ID" };

					const reqOptions =
						castRecord(castRecord(message.data)?.options) || {};
					try {
						const port = daemon.getPort();
						const executeUrl = `http://localhost:${port}/api/jobs/run`;
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
						if (!res.ok) throw new Error(`Daemon responded with ${res.status}`);
						return await res.json();
					} catch (error: unknown) {
						const _e = toError(error);
						// Fallback to CLI if Daemon isn't reachable
						try {
							const os = require("node:os");
							const path = require("node:path");
							const fs = require("node:fs");
							const tempFile = path.join(
								os.tmpdir(),
								`automa-run-${Date.now()}.json`,
							);
							fs.writeFileSync(tempFile, JSON.stringify(workflowData), "utf-8");
							const args = ["run", tempFile];
							if (reqOptions.vaultPath) {
								args.push("--vault-path", reqOptions.vaultPath);
							}
							if (reqOptions.project) {
								args.push("--project", reqOptions.project);
							}
							if (reqOptions.variables) {
								args.push(
									"--variables",
									isString(reqOptions.variables)
										? reqOptions.variables
										: JSON.stringify(reqOptions.variables),
								);
							}
							let result: unknown;
							try {
								result = await daemon.executeCliCommand(args);
							} finally {
								if (fs.existsSync(tempFile)) {
									fs.unlinkSync(tempFile);
								}
							}
							return result;
						} catch (cliErr: unknown) {
							const ce = toError(cliErr);
							Logger.error(`Workflow execution failed: ${ce.message}`);
							return { success: false, error: ce.message };
						}
					}
				}

				case "background--open:dashboard": {
					// For VS Code, we are already the dashboard. Just tell the webview to push route!
					// This is slightly tricky. The webview Vue Router handles hash routing.
					// We can return a specific command, but since this resolves a promise,
					// the webview caller might not be able to navigate themselves if they expect us to.
					// Let's just log it for now since they are in the dashboard.
					Logger.info(`Open Dashboard requested: ${message.data}`);
					return true;
				}

				default:
					Logger.info(`Unhandled runtime message: ${message.name}`);
					return null;
			}
		} catch (error: unknown) {
			const e = toError(error);
			Logger.error(`Runtime Message Error [${message.name}]: ${e.message}`);
			return null;
		}
	}

	private normalizeVaultData(
		rawData: unknown[],
		type: "variable" | "credential" | "table",
	): Record<string, unknown>[] {
		const normalized: Record<string, unknown>[] = [];
		for (const data of rawData) {
			if (Array.isArray(data)) {
				normalized.push(...data);
			} else if (isRecord(data)) {
				for (const [key, val] of Object.entries(data)) {
					let value: string;
					if (type === "variable") {
						value =
							isRecord(val) || Array.isArray(val)
								? JSON.stringify(val)
								: String(val);
					} else {
						value = String(val);
					}
					normalized.push({
						id: key,
						name: key,
						value: value,
					});
				}
			}
		}
		return normalized;
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
				const contents = await Promise.all(
					files.map(async (file) => {
						try {
							const bytes = await vscode.workspace.fs.readFile(file);
							return JSON.parse(Buffer.from(bytes).toString("utf-8"));
						} catch (e: unknown) {
							const msg = getErrorMessage(e);
							const path = require("node:path");
							parseErrors.push(`${path.basename(file.fsPath)}: ${msg}`);
							return null;
						}
					}),
				);

				let validParsed = contents.filter((item) => item !== null);

				if (shouldSanitize && validParsed.length > 0) {
					try {
						const { WorkflowSanitizer } = await import("../core/Sanitizer");
						validParsed = validParsed.map((wf) => {
							WorkflowSanitizer.sanitize(wf);
							return wf;
						});
					} catch (_e: unknown) {
						// Fallback if sanitizer fails
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
			result.variables = this.normalizeVaultData(rawVars, "variable");
			result.credentials = this.normalizeVaultData(rawCreds, "credential");
			result.tables = this.normalizeVaultData(rawTables, "table");
			result.workflowStates = {}; // Initial state
		} catch (error: unknown) {
			const e = toError(error);
			Logger.error(`Failed to fetch storage get: ${e.message}`);
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

				// Pre-read all workflow IDs in parallel to build lookup map
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
							const msg = getErrorMessage(e);
							const path = require("node:path");
							parseErrors.push(`${path.basename(file.fsPath)}: ${msg}`);
						}
					}),
				);

				for (const wf of items.workflows) {
					if (!wf.id) continue;

					let targetUri = idToUriMap.get(wf.id);
					if (!targetUri) {
						const safeName = (wf.name || wf.id)
							.replace(/[^a-z0-9]/gi, "_")
							.toLowerCase();

						const workflowsDir = vscode.Uri.joinPath(
							workspaceRoot,
							"workflows",
						);
						try {
							await vscode.workspace.fs.createDirectory(workflowsDir);
						} catch (_dirErr: unknown) {
							// Ignore if exists
						}

						targetUri = vscode.Uri.joinPath(
							workflowsDir,
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
			const e = getErrorMessage(error);
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
		const uriToDataMap = new Map<
			string,
			Record<string, unknown>[] | Record<string, unknown>
		>();

		for (const file of allFiles) {
			try {
				const content = await vscode.workspace.fs.readFile(file);
				const data = JSON.parse(Buffer.from(content).toString("utf-8"));
				uriToDataMap.set(file.toString(), data);
				if (Array.isArray(data)) {
					for (const item of data) {
						if (item?.id || item?.key || item?.name) {
							const id = item.id || item.key || item.name;
							idToUriMap.set(id as string, file);
						}
					}
				} else if (isRecord(data)) {
					for (const key of Object.keys(data)) {
						idToUriMap.set(key, file);
					}
				}
			} catch (e: unknown) {
				const msg = getErrorMessage(e);
				const path = require("node:path");
				parseErrors.push(`${path.basename(file.fsPath)}: ${msg}`);
			}
		}

		for (const rawItem of itemsList) {
			const item = castRecord(rawItem);
			if (!item?.id) continue;
			const itemId = item.id as string;
			let targetUri = idToUriMap.get(itemId);
			if (!targetUri) {
				const folderDir = vscode.Uri.joinPath(workspaceRoot, folderName);
				try {
					await vscode.workspace.fs.createDirectory(folderDir);
				} catch (_dirErr: unknown) {
					// Ignore if exists
				}
				targetUri = vscode.Uri.joinPath(folderDir, defaultFileName);
			}

			let dataInFile = uriToDataMap.get(targetUri.toString());
			if (!dataInFile) {
				dataInFile = []; // default to array for new files
				uriToDataMap.set(targetUri.toString(), dataInFile);
			}

			if (Array.isArray(dataInFile)) {
				const existingIdx = dataInFile.findIndex(
					(x: Record<string, unknown>) =>
						x.id === itemId || x.key === itemId || x.name === itemId,
				);
				if (existingIdx !== -1) {
					dataInFile[existingIdx] = item;
				} else {
					dataInFile.push(item);
				}
			} else if (isRecord(dataInFile)) {
				dataInFile[itemId] = item.value !== undefined ? item.value : item;
			}
		}

		for (const [uriStr, data] of uriToDataMap.entries()) {
			await vscode.workspace.fs.writeFile(
				vscode.Uri.parse(uriStr),
				Buffer.from(JSON.stringify(data, null, 2), "utf-8"),
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
            });
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
