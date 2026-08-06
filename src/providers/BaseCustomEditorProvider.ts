import * as vscode from "vscode";

export abstract class BaseCustomEditorProvider {
	constructor(protected readonly context: vscode.ExtensionContext) {}

	protected setupWebviewPanel(
		document: vscode.TextDocument | vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
		updateWebview: () => void | Promise<void>,
		additionalDisposables: vscode.Disposable[] = []
	) {
		webviewPanel.webview.options = { enableScripts: true };

		let changeDisposable: vscode.Disposable;

		// Check if it's a TextDocument
		if ("getText" in document) {
			changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
				if (e.document.uri.toString() === document.uri.toString()) {
					updateWebview();
				}
			});
		} else {
			// Fallback to FileSystemWatcher for CustomDocument
			const watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
			const handleChange = () => {
				setTimeout(() => updateWebview(), 50);
			};
			
			const changeSub = watcher.onDidChange(handleChange);
			const createSub = watcher.onDidCreate(handleChange);

			changeDisposable = {
				dispose: () => {
					changeSub.dispose();
					createSub.dispose();
					watcher.dispose();
				}
			};
		}

		webviewPanel.onDidDispose(() => {
			changeDisposable.dispose();
			additionalDisposables.forEach((d) => d.dispose());
		});
	}

	protected async saveDocument(document: vscode.TextDocument, content: string): Promise<boolean> {
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			document.uri,
			new vscode.Range(0, 0, document.lineCount, 0),
			content
		);
		const success = await vscode.workspace.applyEdit(edit);
		if (success) {
			await document.save();
		}
		return success;
	}
}
