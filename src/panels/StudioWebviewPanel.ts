import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
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
            message => {
                switch (message.type) {
                    case 'runtime-message':
                        console.log("Message from Vue app:", message.data);
                        break;
                    case 'storage-set':
                        console.log("Storage set from Vue app:", message.data);
                        break;
                    case 'error':
                        Logger.error("WEBVIEW ERROR: " + message.data);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri, fileUri?: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (StudioWebviewPanel.currentPanel) {
            StudioWebviewPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'automaStudio',
            'Automa Studio',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist')]
            }
        );

        StudioWebviewPanel.currentPanel = new StudioWebviewPanel(panel, extensionUri);
        StudioWebviewPanel.currentPanel._update();
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const indexPath = vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'index.html').fsPath;
        let html = fs.readFileSync(indexPath, 'utf-8');

        const distUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist'));
        
        // Inject VSCode Webview URIs for static assets
        html = html.replace(/src="([^"]+\.js)"/g, (match, p1) => {
            return `src="${distUri}/${p1}"`;
        });
        
        html = html.replace(/href="([^"]+\.css)"/g, (match, p1) => {
            return `href="${distUri}/${p1}"`;
        });

        // Inject error capturing script and VSCode API initialization
        const initScript = `
        <script>
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
        html = html.replace('<head>', '<head>' + initScript);

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
