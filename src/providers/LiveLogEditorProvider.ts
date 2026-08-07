import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";

export class LiveLogEditorProvider {
	public static currentPanels: Map<string, vscode.WebviewPanel> = new Map();

	public static showLiveLog(
		_context: vscode.ExtensionContext,
		taskId: string,
		taskName: string,
	) {
		let panel = LiveLogEditorProvider.currentPanels.get(taskId);

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

		LiveLogEditorProvider.currentPanels.set(taskId, panel);

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
			LiveLogEditorProvider.currentPanels.delete(taskId);
		});
	}

	private static getHtmlForWebview(): string {
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
		}
		ul {
			list-style-type: none;
			padding: 0;
			margin: 0;
		}
		li {
			padding: 4px 0;
			border-bottom: 1px solid var(--vscode-panel-border);
			word-wrap: break-word;
		}
		.timestamp {
			color: var(--vscode-descriptionForeground);
			font-size: 0.9em;
			margin-right: 8px;
		}
		.level-info { color: var(--vscode-terminal-ansiGreen); }
		.level-error { color: var(--vscode-terminal-ansiRed); }
		.level-warn { color: var(--vscode-terminal-ansiYellow); }
	</style>
</head>
<body>
	<ul id="log-list"></ul>

	<script>
		const vscode = acquireVsCodeApi();
		const logList = document.getElementById('log-list');

		window.addEventListener('message', event => {
			const data = event.data;
			
			const li = document.createElement('li');
			
			const timeSpan = document.createElement('span');
			timeSpan.className = 'timestamp';
			timeSpan.textContent = new Date().toLocaleTimeString();
			li.appendChild(timeSpan);

			const contentSpan = document.createElement('span');
			
			// Format data nicely
			let content = '';
			if (data.message) {
				content = data.message;
			} else if (data.name) {
				content = data.name + (data.status ? ' - ' + data.status : '');
			} else {
				content = JSON.stringify(data);
			}
			contentSpan.textContent = content;

			if (data.level) {
				contentSpan.className = 'level-' + data.level.toLowerCase();
			} else if (data.status === 'error') {
				contentSpan.className = 'level-error';
			} else {
				contentSpan.className = 'level-info';
			}
			
			li.appendChild(contentSpan);
			logList.appendChild(li);
			
			window.scrollTo(0, document.body.scrollHeight);
		});
	</script>
</body>
</html>`;
	}
}
