import * as path from "node:path";
import * as vscode from "vscode";
import { isTextDocument } from "../utils/typeGuards";

export abstract class BaseCustomEditorProvider {
	protected internalSaves = new Set<string>();

	constructor(protected readonly context: vscode.ExtensionContext) {}

	protected setupWebviewPanel(
		document: vscode.TextDocument | vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
		updateWebview: () => void | Promise<void>,
		additionalDisposables: vscode.Disposable[] = [],
	) {
		webviewPanel.webview.options = { enableScripts: true };

		let changeDisposable: vscode.Disposable;

		// Check if it's a TextDocument
		if (isTextDocument(document)) {
			changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
				const uriStr = document.uri.toString();
				if (e.document.uri.toString() === uriStr) {
					if (!this.internalSaves.has(uriStr)) {
						const res = updateWebview();
						if (res instanceof Promise) {
							res.catch((err: unknown) =>
								console.error("Webview update error:", err),
							);
						}
					}
				}
			});
		} else {
			// Fallback to FileSystemWatcher for CustomDocument
			const watcher = vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(
					vscode.Uri.file(path.dirname(document.uri.fsPath)),
					path.basename(document.uri.fsPath),
				),
			);
			const uriStr = document.uri.toString();
			const handleChange = () => {
				if (!this.internalSaves.has(uriStr)) {
					setTimeout(() => {
						const res = updateWebview();
						if (res instanceof Promise) {
							res.catch((err: unknown) =>
								console.error("Webview update error:", err),
							);
						}
					}, 50);
				}
			};

			const changeSub = watcher.onDidChange(handleChange);
			const createSub = watcher.onDidCreate(handleChange);

			changeDisposable = {
				dispose: () => {
					changeSub.dispose();
					createSub.dispose();
					watcher.dispose();
				},
			};
		}

		webviewPanel.onDidDispose(() => {
			changeDisposable.dispose();
			additionalDisposables.forEach((d) => {
				d.dispose();
			});
		});
	}

	protected async saveDocument(
		document: vscode.TextDocument,
		content: string,
	): Promise<boolean> {
		const uriStr = document.uri.toString();
		this.internalSaves.add(uriStr);
		try {
			const edit = new vscode.WorkspaceEdit();
			edit.replace(
				document.uri,
				new vscode.Range(0, 0, document.lineCount, 0),
				content,
			);
			const success = await vscode.workspace.applyEdit(edit);
			if (success) {
				await document.save();
			}
			return success;
		} finally {
			// Small delay to ensure the onDidChangeTextDocument event is caught
			setTimeout(() => {
				this.internalSaves.delete(uriStr);
			}, 150);
		}
	}
}
