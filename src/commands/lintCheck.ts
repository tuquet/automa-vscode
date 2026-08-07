import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";
import { castRecord, extractFsPath, toError } from "../utils/typeGuards";

let diagnosticCollection: vscode.DiagnosticCollection;

export function activateLintDiagnostics(context: vscode.ExtensionContext) {
	diagnosticCollection =
		vscode.languages.createDiagnosticCollection("automa-lint");
	context.subscriptions.push(diagnosticCollection);
}

function resolveUrisToProcess(
	nodeOrUri?: unknown,
	nodesOrUris?: unknown[],
): vscode.Uri[] {
	if (Array.isArray(nodesOrUris) && nodesOrUris.length > 0) {
		return nodesOrUris
			.map((n) => {
				const path = extractFsPath(n);
				return path ? vscode.Uri.file(path) : null;
			})
			.filter((uri): uri is vscode.Uri => uri !== null);
	}
	const path = extractFsPath(nodeOrUri);
	if (path) {
		return [vscode.Uri.file(path)];
	}
	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		return [activeEditor.document.uri];
	}
	return [];
}

function parseDiagnosticsFromOutput(
	output: string,
	lines: string[],
): vscode.Diagnostic[] {
	const diagnostics: vscode.Diagnostic[] = [];
	const linesOut = output.split("\n");

	for (const line of linesOut) {
		const trimmed = line.trim();
		if (trimmed.startsWith("- [")) {
			// Structural schema deviations in the Editor context are Warnings, not Errors.
			// Variable Warnings are also Warnings.
			const isVariableWarning = trimmed.includes("[Variable Warning]");
			const isStructuralDeviation =
				trimmed.toLowerCase().includes("node id") ||
				trimmed.toLowerCase().includes("edge") ||
				trimmed.toLowerCase().includes("type") ||
				trimmed.toLowerCase().includes("required property") ||
				trimmed.toLowerCase().includes("schema");

			const isError = !isVariableWarning && !isStructuralDeviation;
			const severity = isError
				? vscode.DiagnosticSeverity.Error
				: vscode.DiagnosticSeverity.Warning;

			let range = new vscode.Range(0, 0, 0, 0);
			let searchString = "";

			if (trimmed.includes("Node ID '")) {
				const idMatch = trimmed.match(/Node ID '([^']+)'/);
				if (idMatch) searchString = `"${idMatch[1]}"`;
			} else if (trimmed.includes("Variable '")) {
				const varMatch = trimmed.match(/Variable '([^']+)'/);
				if (varMatch) searchString = varMatch[1];
			} else {
				const quoteMatch = trimmed.match(/'([^']+)'/);
				if (quoteMatch) searchString = `"${quoteMatch[1]}"`;
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

			const msg = trimmed.replace(/^- \[.*?\] /, "");
			const diagnostic = new vscode.Diagnostic(range, msg, severity);
			diagnostics.push(diagnostic);
		}
	}
	return diagnostics;
}

export async function lintCheckCommand(
	nodeOrUri?: unknown,
	nodesOrUris?: unknown[],
) {
	const urisToProcess = resolveUrisToProcess(nodeOrUri, nodesOrUris);

	if (urisToProcess.length === 0) {
		const uris = await vscode.window.showOpenDialog({
			canSelectMany: true,
			openLabel: "Select Workflow(s) to Lint",
			filters: {
				"JSON files": ["json"],
			},
		});
		if (!uris || uris.length === 0) return;
		urisToProcess.push(...uris);
	}

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Window,
			title: "Linting Automa Workflow(s)...",
			cancellable: false,
		},
		async () => {
			let totalErrors = 0;
			let totalWarnings = 0;
			let totalPassed = 0;
			let totalProcessed = 0;

			for (const uri of urisToProcess) {
				const filePath = uri.fsPath;

				const document = await vscode.workspace.openTextDocument(uri);
				const content = document.getText();
				const lines = content.split("\n");

				try {
					let output = "";

					try {
						const daemon = DaemonManager.getInstance();
						const port = daemon.getPort();
						let type = "workflow";
						if (filePath.endsWith(".package.json")) type = "package";
						else if (filePath.endsWith(".fleet.json")) type = "fleet";
						else if (
							filePath.endsWith(".table.json") ||
							filePath.endsWith(".variable.json") ||
							filePath.endsWith(".credential.json")
						)
							type = "globals";
						const res = await fetch(`http://localhost:${port}/api/lint`, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ content, type }),
						});
						if (!res.ok) throw new Error("Daemon not ready");

						const data = castRecord(await res.json());
						const errStrs = ((data.errors as string[]) || []).map(
							(e: string) => `- [Error] ${e}`,
						);
						const warnStrs = ((data.warnings as string[]) || []).map(
							(w: string) => `- [Warning] ${w}`,
						);
						output = [...errStrs, ...warnStrs].join("\n");
					} catch (_err: unknown) {
						// Fallback to CLI
						const { stdout, stderr } =
							await DaemonManager.getInstance().executeRawCliCommand([
								"lint",
								filePath,
							]);
						output = `${stdout}\n${stderr}`;
					}

					const diagnostics = parseDiagnosticsFromOutput(output, lines);
					diagnosticCollection.set(uri, diagnostics);

					totalProcessed++;

					if (diagnostics.length === 0) {
						totalPassed++;
					} else {
						const errorCount = diagnostics.filter(
							(d) => d.severity === vscode.DiagnosticSeverity.Error,
						).length;
						const warnCount = diagnostics.length - errorCount;
						totalErrors += errorCount;
						totalWarnings += warnCount;
					}
				} catch (error: unknown) {
					const e = toError(error);
					vscode.window.showErrorMessage(
						`Failed to run linter on ${filePath.split(/\\|\//).pop()}: ${e.message}`,
					);
				}
			}

			if (totalProcessed === 1) {
				const filePath = urisToProcess[0].fsPath.split(/\\|\//).pop();
				if (totalErrors === 0 && totalWarnings === 0) {
					vscode.window.showInformationMessage(`Lint passed for ${filePath}`);
				} else {
					const msg = `Lint finished: ${totalErrors} error(s), ${totalWarnings} warning(s) in ${filePath}`;
					if (totalErrors > 0) {
						vscode.window.showErrorMessage(msg);
					} else {
						vscode.window.showWarningMessage(msg);
					}
				}
			} else if (totalProcessed > 1) {
				const msg = `Lint finished for ${totalProcessed} files: ${totalPassed} passed, ${totalErrors} total error(s), ${totalWarnings} total warning(s).`;
				if (totalErrors > 0) {
					vscode.window.showErrorMessage(msg);
				} else if (totalWarnings > 0) {
					vscode.window.showWarningMessage(msg);
				} else {
					vscode.window.showInformationMessage(msg);
				}
			}
		},
	);
}
