import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";

const currentPanels: Map<string, vscode.WebviewPanel> = new Map();

export const LiveLogEditorProvider = {
	currentPanels,

	showLiveLog(
		_context: vscode.ExtensionContext,
		taskId: string,
		taskName: string,
	) {
		let panel = currentPanels.get(taskId);

		if (panel) {
			panel.reveal(vscode.ViewColumn.One);
			return;
		}

		panel = vscode.window.createWebviewPanel(
			"automaLiveLog",
			`Live Log: ${taskName}`,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			},
		);

		currentPanels.set(taskId, panel);

		panel.webview.html = LiveLogEditorProvider.getHtmlForWebview();

		const listener = (data: Record<string, unknown>) => {
			if (
				data &&
				(data.taskId === taskId ||
					data.id === taskId ||
					data.runnerId === taskId)
			) {
				panel?.webview.postMessage(data);
			}
		};

		TaskRunner.telemetryEmitter.on("telemetry", listener);

		panel.onDidDispose(() => {
			TaskRunner.telemetryEmitter.off("telemetry", listener);
			currentPanels.delete(taskId);
		});
	},

	getHtmlForWebview(): string {
		return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live Log</title>
    <style>
        body {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 10px;
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        #log-container {
            flex-grow: 1;
            overflow-y: auto;
            border: 1px solid var(--vscode-panel-border);
            padding: 10px;
            background-color: var(--vscode-editor-background);
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .log-entry {
            margin-bottom: 4px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 4px;
        }
        .log-header {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 2px;
        }
        .log-body {
            margin-left: 10px;
        }
        .log-error {
            color: var(--vscode-errorForeground);
        }
        .log-success {
            color: var(--vscode-testing-iconPassed);
        }
        .log-info {
            color: var(--vscode-descriptionForeground);
        }
        .status-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.9em;
            margin-left: 8px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
    </style>
</head>
<body>
    <div id="log-container"></div>
    <script>
        const vscode = acquireVsCodeApi();
        const container = document.getElementById('log-container');

        window.addEventListener('message', event => {
            const message = event.data;
            const div = document.createElement('div');
            div.className = 'log-entry';

            let headerHTML = '';
            let bodyHTML = '';
            let statusClass = 'log-info';

            if (message.type === 'telemetry') {
                const name = message.name || 'Task';
                const status = message.status || 'running';
                
                if (status === 'success') statusClass = 'log-success';
                else if (status === 'error' || status === 'failed') statusClass = 'log-error';

                headerHTML = \`<span class="log-header \${statusClass}">[\${escapeHtml(name)}]</span><span class="status-badge">\${escapeHtml(status)}</span>\`;
                
                if (message.message) {
                    bodyHTML = \`<div class="log-body">\${escapeHtml(message.message)}</div>\`;
                } else if (message.error) {
                     bodyHTML = \`<div class="log-body log-error">\${escapeHtml(message.error)}</div>\`;
                }
            } else {
                 headerHTML = \`<span class="log-header">[Log]</span>\`;
                 bodyHTML = \`<div class="log-body">\${escapeHtml(JSON.stringify(message))}</div>\`;
            }

            div.innerHTML = headerHTML + bodyHTML;
            container.appendChild(div);
            
            // Auto-scroll
            container.scrollTop = container.scrollHeight;
        });

        function escapeHtml(unsafe) {
            if (typeof unsafe !== 'string') return unsafe;
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        }
    </script>
</body>
</html>`;
	},
};
