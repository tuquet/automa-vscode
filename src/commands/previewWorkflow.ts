import * as vscode from "vscode";
import * as fs from "node:fs";

let currentPanel: vscode.WebviewPanel | undefined = undefined;

export function previewWorkflowCommand(context: vscode.ExtensionContext) {
	return async (uri?: vscode.Uri) => {
		let targetUri = uri;
		if (!targetUri) {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor && activeEditor.document.languageId === "json") {
				targetUri = activeEditor.document.uri;
			}
		}

		if (!targetUri) {
			vscode.window.showErrorMessage(
				"No JSON file selected for preview.",
			);
			return;
		}

		const column = vscode.window.activeTextEditor
			? vscode.ViewColumn.Beside
			: vscode.ViewColumn.One;

		if (currentPanel) {
			currentPanel.reveal(column);
		} else {
			currentPanel = vscode.window.createWebviewPanel(
				"automaPreview",
				"Workflow Preview",
				column,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
				},
			);

			currentPanel.onDidDispose(() => {
				currentPanel = undefined;
			});
		}

		const updateWebview = (fileUri: vscode.Uri) => {
			if (!currentPanel) return;
			try {
				const content = fs.readFileSync(fileUri.fsPath, "utf-8");
				const json = JSON.parse(content);
				
				let nodes: any[] = [];
				let edges: any[] = [];

				if (json.drawflow && json.drawflow.nodes && json.drawflow.edges) {
					nodes = json.drawflow.nodes;
					edges = json.drawflow.edges;
				} else if (Array.isArray(json)) {
					vscode.window.showWarningMessage("This JSON does not look like an Automa workflow.");
					return;
				}

				const mermaidGraph = generateMermaid(nodes, edges);
				currentPanel.title = `Preview: ${json.name || "Workflow"}`;
				currentPanel.webview.html = getHtmlContent(mermaidGraph);
			} catch (e: any) {
				currentPanel.webview.html = `<body><h2>Error reading workflow</h2><p>${e.message}</p></body>`;
			}
		};

		// Initial load
		updateWebview(targetUri);

		// Watch for changes in the active document
		const changeListener = vscode.workspace.onDidChangeTextDocument((e) => {
			if (
				currentPanel &&
				e.document.uri.fsPath === targetUri?.fsPath
			) {
				updateWebview(targetUri);
			}
		});

		currentPanel.onDidDispose(() => {
			changeListener.dispose();
		});
	};
}

function generateMermaid(nodes: any[], edges: any[]): string {
	let graph = "graph TD\n";

	const nodeMap = new Map();

	// Add nodes
	for (const node of nodes) {
		const safeId = sanitizeId(node.id);
		const label = (node.label || node.id).replace(/["']/g, "");
		graph += `  ${safeId}["${label}"]\n`;
		nodeMap.set(node.id, safeId);
	}

	// Add edges
	for (const edge of edges) {
		const sourceId = sanitizeId(edge.source);
		const targetId = sanitizeId(edge.target);
		if (sourceId && targetId) {
			graph += `  ${sourceId} --> ${targetId}\n`;
		}
	}

	return graph;
}

function sanitizeId(id: string): string {
	if (!id) return "unknown";
	// Mermaid IDs shouldn't have spaces or special dashes if possible
	return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function getHtmlContent(mermaidGraph: string): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Preview</title>
    <style>
        body, html { 
            margin: 0; 
            padding: 0; 
            width: 100%; 
            height: 100%; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .mermaid {
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
        }
    </style>
</head>
<body>
    <div class="mermaid">
        ${mermaidGraph}
    </div>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        
        // Detect VS Code theme
        const isDark = document.body.classList.contains('vscode-dark') || 
                      document.body.classList.contains('vscode-high-contrast');
                      
        mermaid.initialize({ 
            startOnLoad: true, 
            theme: isDark ? 'dark' : 'default',
			securityLevel: 'loose'
        });
    </script>
</body>
</html>`;
}
