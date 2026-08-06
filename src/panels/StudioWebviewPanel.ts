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
					case 'runtime-message':
                        this.handleRuntimeMessage(message.data).then(result => {
                            this._panel.webview.postMessage({ type: 'runtime-message-response', id: message.id, data: result });
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

    private async handleRuntimeMessage(message: any): Promise<any> {
        if (!message || !message.name) return null;
        
        try {
            switch (message.name) {
                case 'background--fetch':
                case 'background--fetch:text': {
                    let url = '';
                    let options: any = {};
                    
                    if (typeof message.data === 'string') {
                        url = message.data;
                    } else if (message.data && message.data.resource) {
                        url = message.data.resource.url || message.data.resource;
                        options = message.data.resource;
                    }
                    
                    if (!url) throw new Error("Fetch URL missing");
                    
                    const res = await fetch(url, options);
                    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
                    
                    if (message.name === 'background--fetch:text') {
                        return await res.text();
                    }
                    
                    const type = message.data?.type || 'json';
                    if (type === 'json') return await res.json();
                    if (type === 'text') return await res.text();
                    
                    // base64 handling for images
                    if (type === 'base64') {
                        const buffer = await res.arrayBuffer();
                        return Buffer.from(buffer).toString('base64');
                    }
                    
                    return await res.text();
                }
                
                case 'background--workflow:execute': {
                    const { DaemonManager } = require("../core/DaemonManager");
                    const daemon = DaemonManager.getInstance();
                    
                    const workflowData = message.data?.workflowData || message.data;
                    if (!workflowData || !workflowData.id) return { success: false, error: "Missing workflow ID" };
                    
                    try {
                        const port = daemon.getPort();
                        const executeUrl = `http://localhost:${port}/api/jobs/run`;
                        const res = await fetch(executeUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ workflowData, options: message.data?.options || {} })
                        });
                        if (!res.ok) throw new Error(`Daemon responded with ${res.status}`);
                        return await res.json();
                    } catch (e: any) {
                        // Fallback to CLI if Daemon isn't reachable
                        try {
                            const result = await daemon.executeCliCommand(["run", workflowData.id]);
                            return result;
                        } catch (cliErr: any) {
                            Logger.error(`Workflow execution failed: ${cliErr.message}`);
                            return { success: false, error: cliErr.message };
                        }
                    }
                }
                
                case 'background--open:dashboard': {
                    // For VS Code, we are already the dashboard. Just tell the webview to push route!
                    // This is slightly tricky. The webview Vue Router handles hash routing.
                    // We can return a specific command, but since this resolves a promise,
                    // the webview caller might not be able to navigate themselves if they expect us to.
                    // Let's just log it for now since they are in the dashboard.
                    Logger.info("Open Dashboard requested: " + message.data);
                    return true;
                }
                
                default:
                    Logger.info(`Unhandled runtime message: ${message.name}`);
                    return null;
            }
        } catch (e: any) {
            Logger.error(`Runtime Message Error [${message.name}]: ${e.message}`);
            return null;
        }
    }

	private async handleStorageGet(_keys: any): Promise<any> {
		const result: any = {};
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

			const readJsonFiles = async (files: vscode.Uri[]) => {
				const contents = await Promise.all(
					files.map(async (file) => {
						try {
							const bytes = await vscode.workspace.fs.readFile(file);
							return JSON.parse(Buffer.from(bytes).toString("utf-8"));
						} catch (_e) {
							return null;
						}
					}),
				);
				return contents.filter((item) => item !== null);
			};

			const [workflows, rawVars, rawCreds, rawTables] = await Promise.all([
				readJsonFiles(workflowFiles),
				readJsonFiles(variableFiles),
				readJsonFiles(credentialFiles),
				readJsonFiles(tableFiles),
			]);

			result.workflows = workflows;
			result.variables = rawVars.flat();
			result.credentials = rawCreds.flat();
			result.tables = rawTables.flat();
			result.workflowStates = {}; // Initial state
		} catch (e: any) {
			Logger.error(`Failed to fetch storage get: ${e.message}`);
		}

		return result;
	}

	private async handleStorageSet(items: any) {
		if (
			!vscode.workspace.workspaceFolders ||
			vscode.workspace.workspaceFolders.length === 0
		)
			return;
		const workspaceRoot = vscode.workspace.workspaceFolders[0].uri;
		const EXCLUDE_PATTERN =
			"**/{node_modules,.git,dist,out,.gemini,tmp,build}/**";

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
						} catch (_e) {}
					}),
				);

				for (const wf of items.workflows) {
					if (!wf.id) continue;

					let targetUri = idToUriMap.get(wf.id);
					if (!targetUri) {
						const safeName = (wf.name || wf.id)
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
		} catch (e: any) {
			Logger.error(`Failed to handle storage set: ${e.message}`);
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
