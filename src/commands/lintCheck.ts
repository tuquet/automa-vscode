import * as vscode from "vscode";
import { exec } from "node:child_process";

let diagnosticCollection: vscode.DiagnosticCollection;

export function activateLintDiagnostics(context: vscode.ExtensionContext) {
	diagnosticCollection = vscode.languages.createDiagnosticCollection("automa-lint");
	context.subscriptions.push(diagnosticCollection);
}

export async function lintCheckCommand(nodeOrUri?: any, nodesOrUris?: any[]) {
	let urisToProcess: vscode.Uri[] = [];

	if (nodesOrUris && nodesOrUris.length > 0) {
		urisToProcess = nodesOrUris;
	} else if (nodeOrUri instanceof vscode.Uri) {
		urisToProcess = [nodeOrUri];
	} else {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			urisToProcess = [activeEditor.document.uri];
		}
	}

	if (urisToProcess.length === 0) {
		vscode.window.showInformationMessage("No workflow files selected for linting.");
		return;
	}

	const isWin = process.platform === "win32";
	const npxCmd = isWin ? "npx.cmd" : "npx";

	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Window,
			title: "Linting Automa Workflow(s)...",
			cancellable: false
		},
		async () => {
			for (const uri of urisToProcess) {
				const filePath = uri.fsPath;
				
				// Read file to find lines for diagnostics
				const document = await vscode.workspace.openTextDocument(uri);
				const content = document.getText();
				const lines = content.split('\n');

				// Execute automa lint
				await new Promise<void>((resolve) => {
					exec(`"${npxCmd}" automa lint "${filePath}"`, (error, stdout, stderr) => {
						const output = stdout + "\n" + stderr;
						
						const diagnostics: vscode.Diagnostic[] = [];
						
						// Parse output for errors
						const linesOut = output.split('\n');
						for (const line of linesOut) {
							const trimmed = line.trim();
							if (trimmed.startsWith('- [')) {
								const isError = !trimmed.includes('[Variable Warning]');
								const severity = isError ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
								
								let range = new vscode.Range(0, 0, 0, 0);
								
								// Try to find exact line
								let searchString = "";
								if (trimmed.includes("Node ID '")) {
									const idMatch = trimmed.match(/Node ID '([^']+)'/);
									if (idMatch) searchString = `"${idMatch[1]}"`;
								} else if (trimmed.includes("Variable '")) {
									const varMatch = trimmed.match(/Variable '([^']+)'/);
									if (varMatch) searchString = varMatch[1];
								}

								if (searchString) {
									for (let i = 0; i < lines.length; i++) {
										const col = lines[i].indexOf(searchString);
										if (col !== -1) {
											range = new vscode.Range(i, col, i, col + searchString.length);
											break;
										}
									}
								}

								const msg = trimmed.replace(/^- \[.*?\] /, '');
								const diagnostic = new vscode.Diagnostic(range, msg, severity);
								diagnostics.push(diagnostic);
							}
						}

						diagnosticCollection.set(uri, diagnostics);

						if (diagnostics.length === 0) {
							vscode.window.showInformationMessage(`Lint passed for ${filePath.split(/\\|\//).pop()}`);
						} else {
							const errorCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
							const warnCount = diagnostics.length - errorCount;
							vscode.window.showErrorMessage(`Lint failed: ${errorCount} error(s), ${warnCount} warning(s) in ${filePath.split(/\\|\//).pop()}`);
						}
						
						resolve();
					});
				});
			}
		}
	);
}
