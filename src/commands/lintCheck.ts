import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";

let diagnosticCollection: vscode.DiagnosticCollection;

export function activateLintDiagnostics(context: vscode.ExtensionContext) {
	diagnosticCollection =
		vscode.languages.createDiagnosticCollection("automa-lint");
	context.subscriptions.push(diagnosticCollection);
}

function resolveUrisToProcess(
	nodeOrUri?: any,
	nodesOrUris?: any[],
): vscode.Uri[] {
	if (nodesOrUris && nodesOrUris.length > 0) {
		return nodesOrUris;
	} else if (nodeOrUri instanceof vscode.Uri) {
		return [nodeOrUri];
	} else {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			return [activeEditor.document.uri];
		}
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

export async function lintCheckCommand(nodeOrUri?: any, nodesOrUris?: any[]) {
	const urisToProcess = resolveUrisToProcess(nodeOrUri, nodesOrUris);

	if (urisToProcess.length === 0) {
		vscode.window.showInformationMessage(
			"No workflow files selected for linting.",
		);
		return;
	}

	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Window,
			title: "Linting Automa Workflow(s)...",
			cancellable: false,
		},
		async () => {
			for (const uri of urisToProcess) {
				const filePath = uri.fsPath;

				const document = await vscode.workspace.openTextDocument(uri);
				const content = document.getText();
				const lines = content.split("\n");

				try {
					const { stdout, stderr } =
						await DaemonManager.getInstance().executeRawCliCommand([
							"lint",
							filePath,
						]);
					const output = `${stdout}\n${stderr}`;

					const diagnostics = parseDiagnosticsFromOutput(output, lines);
					diagnosticCollection.set(uri, diagnostics);

					if (diagnostics.length === 0) {
						vscode.window.showInformationMessage(
							`Lint passed for ${filePath.split(/\\|\//).pop()}`,
						);
					} else {
						const errorCount = diagnostics.filter(
							(d) => d.severity === vscode.DiagnosticSeverity.Error,
						).length;
						const warnCount = diagnostics.length - errorCount;
						vscode.window.showErrorMessage(
							`Lint finished: ${errorCount} error(s), ${warnCount} warning(s) in ${filePath.split(/\\|\//).pop()}`,
						);
					}
				} catch (error: unknown) {
					const e = error instanceof Error ? error : new Error(String(error));
					vscode.window.showErrorMessage(`Failed to run linter: ${e.message}`);
				}
			}
		},
	);
}
