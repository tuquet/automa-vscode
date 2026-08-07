import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { runWorkflowCommand } from "../commands/runWorkflow";
import { BaseCustomEditorProvider } from "./BaseCustomEditorProvider";

export class WorkflowPreviewEditorProvider
	extends BaseCustomEditorProvider
	implements vscode.CustomTextEditorProvider
{
	public static readonly viewType = "automa.workflowPreview";

	public static register(context: vscode.ExtensionContext) {
		context.subscriptions.push(
			vscode.window.registerCustomEditorProvider(
				WorkflowPreviewEditorProvider.viewType,
				new WorkflowPreviewEditorProvider(context),
				{
					webviewOptions: {
						retainContextWhenHidden: true,
					},
					supportsMultipleEditorsPerDocument: false,
				},
			),
		);
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken,
	): Promise<void> {
		const updateWebview = () => this.renderWebview(document, webviewPanel);

		// Message Listener
		const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
			async (message) => {
				if (message.command === "runWorkflow") {
					runWorkflowCommand(document.uri, message.parameters, {
						keepBrowserOpen: message.keepBrowserOpen,
					});
				} else if (message.command === "saveWorkflow") {
					await this.handleSaveWorkflow(document, message.data);
				} else if (message.command === "openInStudio") {
					vscode.commands.executeCommand("automa.openInStudio", document.uri);
				}
			},
		);

		this.setupWebviewPanel(document, webviewPanel, updateWebview, [
			messageDisposable,
		]);

		// Initial render
		updateWebview();
	}

	private async sanitizeDocument(
		document: vscode.TextDocument,
		json: any,
	): Promise<void> {
		const { WorkflowSanitizer } = await import("../core/Sanitizer");
		const isModified = WorkflowSanitizer.sanitize(json);

		if (isModified) {
			this.isInternalSave = true;
			try {
				const edit = new vscode.WorkspaceEdit();
				edit.replace(
					document.uri,
					new vscode.Range(0, 0, document.lineCount, 0),
					JSON.stringify(json, null, 4),
				);
				// Apply silently in the background
				await vscode.workspace.applyEdit(edit);
			} finally {
				setTimeout(() => {
					this.isInternalSave = false;
				}, 150);
			}
		}
	}

	private async prepareTriggerParameters(
		document: vscode.TextDocument,
		json: any,
		content: string,
	): Promise<any[]> {
		const { WorkflowParser } = await import("../core/WorkflowParser");
		const implicitVars = WorkflowParser.extractImplicitVariables(content);
		const triggerParams = WorkflowParser.extractTriggerParameters(
			json,
			implicitVars,
		);

		// Get workspace settings to pre-fill global variables
		const config = vscode.workspace.getConfiguration("automa", document.uri);
		const globalVariables = config.get<any>("vault.run.globalVariables", {});

		for (const varName of implicitVars) {
			let defaultVal = "";
			if (globalVariables && typeof globalVariables === "object") {
				const strippedName = varName.startsWith("$$")
					? varName.slice(2)
					: varName;
				if (globalVariables[varName] !== undefined) {
					defaultVal = globalVariables[varName];
				} else if (globalVariables[strippedName] !== undefined) {
					defaultVal = globalVariables[strippedName];
				}
			}
			triggerParams.push({
				name: varName,
				description: varName.startsWith("$$")
					? "(Auto-detected Global Var)"
					: "(Auto-detected Implicit Var)",
				defaultValue: defaultVal,
				value: defaultVal,
				required: false,
				isImplicit: true,
			});
		}

		return triggerParams;
	}

	private getUpdatedAtString(uri: vscode.Uri): string {
		try {
			if (uri.scheme === "file") {
				const updatedAt = fs.statSync(uri.fsPath).mtimeMs;
				return new Date(updatedAt).toLocaleString();
			}
		} catch (_err) {}
		return "";
	}

	private async renderWebview(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
	) {
		try {
			const content = document.getText();
			const json = JSON.parse(content);

			await this.sanitizeDocument(document, json);

			if (
				!(json.drawflow?.nodes && json.drawflow.edges) &&
				Array.isArray(json)
			) {
				webviewPanel.webview.html = `<body><h2>Not an Automa workflow</h2><p>This JSON file does not appear to be an Automa workflow.</p></body>`;
				return;
			}

			const triggerParams = await this.prepareTriggerParameters(
				document,
				json,
				content,
			);
			const updatedAtStr = this.getUpdatedAtString(document.uri);

			const isPackage =
				json.settings?.asBlock === true ||
				Array.isArray(json.inputs) ||
				Array.isArray(json.outputs);
			const pkgInputs = Array.isArray(json.inputs) ? json.inputs : [];
			const pkgOutputs = Array.isArray(json.outputs) ? json.outputs : [];
			const pkgVars = Array.isArray(json.variable) ? json.variable : [];

			webviewPanel.title = `Preview: ${json.name || "Workflow"}`;
			webviewPanel.webview.html = this.getHtmlContent(
				json,
				triggerParams,
				updatedAtStr,
				isPackage,
				pkgInputs,
				pkgOutputs,
				pkgVars,
			);
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			webviewPanel.webview.html = `<body><h2>Error reading workflow</h2><p>${e.message}</p></body>`;
		}
	}

	private async handleSaveWorkflow(
		document: vscode.TextDocument,
		updateData: any,
	) {
		try {
			const content = document.getText();
			const json = JSON.parse(content);

			// Update fields
			if (updateData.name !== undefined) json.name = updateData.name;
			if (updateData.description !== undefined)
				json.description = updateData.description;
			if (updateData.version !== undefined) json.version = updateData.version;
			if (updateData.extVersion !== undefined)
				json.extVersion = updateData.extVersion;
			if (updateData.icon !== undefined) json.icon = updateData.icon;
			if (updateData.globalData !== undefined)
				json.globalData = updateData.globalData;

			// JSON parse for objects/arrays
			if (updateData.settings !== undefined) {
				try {
					json.settings =
						updateData.settings.trim() === ""
							? {}
							: JSON.parse(updateData.settings);
				} catch (error: unknown) {
					const e = error instanceof Error ? error : new Error(String(error));
					throw new Error(`Invalid JSON in Settings: ${e.message}`);
				}
			}
			if (updateData.table !== undefined) {
				try {
					json.table =
						updateData.table.trim() === "" ? [] : JSON.parse(updateData.table);
				} catch (error: unknown) {
					const e = error instanceof Error ? error : new Error(String(error));
					throw new Error(`Invalid JSON in Table: ${e.message}`);
				}
			}
			if (updateData.includedWorkflows !== undefined) {
				try {
					json.includedWorkflows =
						updateData.includedWorkflows.trim() === ""
							? {}
							: JSON.parse(updateData.includedWorkflows);
				} catch (error: unknown) {
					const e = error instanceof Error ? error : new Error(String(error));
					throw new Error(`Invalid JSON in Included Workflows: ${e.message}`);
				}
			}

			// Update Trigger Parameters Default Values
			if (updateData.triggerParams && json.drawflow?.nodes) {
				const triggerNode = json.drawflow.nodes.find(
					(n: any) =>
						n.label === "trigger" ||
						n.name === "trigger" ||
						n.type === "BlockTrigger",
				);
				if (triggerNode && Array.isArray(triggerNode.data?.parameters)) {
					for (const param of triggerNode.data.parameters) {
						if (updateData.triggerParams[param.name] !== undefined) {
							param.defaultValue = updateData.triggerParams[param.name];
						}
					}
				}
			}

			// Apply edits to document
			await this.saveDocument(document, JSON.stringify(json, null, 4));

			vscode.window.showInformationMessage("Workflow saved successfully!");
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			vscode.window.showErrorMessage(`Failed to save workflow: ${e.message}`);
		}
	}

	private processHtmlTemplate(
		templateName: string,
		json: any,
		updatedAtStr: string,
		jsonStringifySafe: (obj: any) => string,
	): string {
		try {
			const htmlPath = path.join(
				this.context.extensionPath,
				"src",
				"webview",
				templateName,
			);
			let htmlContent = fs.readFileSync(htmlPath, "utf-8");

			const updatedAtHtml = updatedAtStr
				? `<p class="text-xs text-vsc-muted mt-1 flex items-center gap-1">
				<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM13 12H17V14H11V7H13V12Z"></path></svg>
				Updated At: ${updatedAtStr}
			</p>`
				: "";

			const safeString = (str: any) =>
				str
					? String(str)
							.replace(/\\/g, "\\\\")
							.replace(/`/g, "\\`")
							.replace(/\$\{/g, "\\${")
							.replace(/<\/script>/gi, "<\\/script>")
					: "";

			htmlContent = htmlContent.replace(
				/\{\{WORKFLOW_NAME\}\}/g,
				json.name ||
					(templateName.includes("package")
						? "Untitled Package"
						: "Untitled Workflow"),
			);
			htmlContent = htmlContent.replace("{{UPDATED_AT_HTML}}", updatedAtHtml);
			htmlContent = htmlContent.replace(
				"{{JSON_ID}}",
				safeString(json.id) || "N/A",
			);
			htmlContent = htmlContent.replace("{{JSON_NAME}}", safeString(json.name));
			htmlContent = htmlContent.replace(
				"{{JSON_DESCRIPTION}}",
				safeString(json.description),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_SETTINGS}}",
				jsonStringifySafe(json.settings),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_ICON}}",
				json.icon || "riGlobalLine",
			);

			// Additional fields common but maybe not in both, replacing won't hurt if they don't exist in template
			htmlContent = htmlContent.replace(
				"{{JSON_VERSION}}",
				safeString(json.version),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_EXT_VERSION}}",
				safeString(json.extVersion),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_GLOBAL_DATA}}",
				safeString(json.globalData),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_TABLE}}",
				jsonStringifySafe(json.table),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_INCLUDED_WORKFLOWS}}",
				jsonStringifySafe(json.includedWorkflows),
			);

			return htmlContent;
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			return `<body><h2>Error loading HTML template</h2><pre>${e.message}</pre></body>`;
		}
	}

	private getWorkflowHtml(
		json: any,
		triggerParams: any[],
		updatedAtStr: string,
		jsonStringifySafe: (obj: any) => string,
	): string {
		let htmlContent = this.processHtmlTemplate(
			"workflow-preview.html",
			json,
			updatedAtStr,
			jsonStringifySafe,
		);

		if (htmlContent.startsWith("<body><h2>Error")) return htmlContent;

		const config = vscode.workspace.getConfiguration("automa");
		const defaultKeepBrowserOpen = !config.get<boolean>(
			"vault.run.closeBrowserOnFinish",
			true,
		);

		htmlContent = htmlContent.replace(
			"{{INJECT_PARAMS_DATA}}",
			`const tParams = ${JSON.stringify(triggerParams).replace(/</g, "\\u003c")};\nconst defaultKeepBrowserOpen = ${defaultKeepBrowserOpen};`,
		);

		return htmlContent;
	}

	private getPackageHtml(
		json: any,
		pkgInputs: any[],
		pkgOutputs: any[],
		pkgVars: any[],
		triggerParams: any[],
		updatedAtStr: string,
		jsonStringifySafe: (obj: any) => string,
	): string {
		let htmlContent = this.processHtmlTemplate(
			"package-preview.html",
			json,
			updatedAtStr,
			jsonStringifySafe,
		);

		if (htmlContent.startsWith("<body><h2>Error")) return htmlContent;

		const injectPackageData = `
				const pInputs = ${JSON.stringify(pkgInputs)};
				const pOutputs = ${JSON.stringify(pkgOutputs)};
				const pVars = ${JSON.stringify(pkgVars)};
				const tParams = ${JSON.stringify(triggerParams)};
			`;
		htmlContent = htmlContent.replace(
			"{{INJECT_PACKAGE_DATA}}",
			injectPackageData,
		);

		return htmlContent;
	}

	private getHtmlContent(
		json: any,
		triggerParams: any[],
		updatedAtStr: string,
		isPackage: boolean = false,
		pkgInputs: any[] = [],
		pkgOutputs: any[] = [],
		pkgVars: any[] = [],
	): string {
		const jsonStringifySafe = (obj: any) =>
			obj
				? JSON.stringify(obj, null, 2)
						.replace(/\\/g, "\\\\")
						.replace(/`/g, "\\`")
						.replace(/\$\{/g, "\\${")
						.replace(/<\/script>/gi, "<\\/script>")
				: "";

		if (isPackage) {
			return this.getPackageHtml(
				json,
				pkgInputs,
				pkgOutputs,
				pkgVars,
				triggerParams,
				updatedAtStr,
				jsonStringifySafe,
			);
		} else {
			return this.getWorkflowHtml(
				json,
				triggerParams,
				updatedAtStr,
				jsonStringifySafe,
			);
		}
	}
}
