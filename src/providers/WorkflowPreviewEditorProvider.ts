import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { runWorkflowCommand } from "../commands/runWorkflow";
import {
	castRecord,
	castRecordArray,
	getProp,
	hasObjectProp,
	isRecord,
	toError,
} from "../utils/typeGuards";
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
		let isRendered = false;
		let hasError = false;
		const updateWebview = async () => {
			if (!isRendered || hasError) {
				const success = await this.renderWebview(document, webviewPanel);
				hasError = !success;
				isRendered = true;
			} else {
				await this.postUpdateMessage(document, webviewPanel);
			}
		};

		// Message Listener
		const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
			async (message) => {
				try {
					if (message.command === "runWorkflow") {
						await runWorkflowCommand(document.uri, message.parameters, {
							keepBrowserOpen: message.keepBrowserOpen,
						});
					} else if (message.command === "saveWorkflow") {
						await this.handleSaveWorkflow(document, message.data);
					} else if (message.command === "openInStudio") {
						await vscode.commands.executeCommand(
							"automa.openInStudio",
							document.uri,
						);
					}
				} catch (error: unknown) {
					const e = toError(error);
					vscode.window.showErrorMessage(`Action failed: ${e.message}`);
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
		json: Record<string, unknown>,
	): Promise<void> {
		const { WorkflowSanitizer } = await import("../core/Sanitizer");
		const isModified = WorkflowSanitizer.sanitize(json);

		if (isModified) {
			await this.saveDocument(document, JSON.stringify(json, null, 4));
		}
	}

	private async prepareTriggerParameters(
		document: vscode.TextDocument,
		json: Record<string, unknown>,
		content: string,
	): Promise<Record<string, unknown>[]> {
		const { WorkflowParser } = await import("../core/WorkflowParser");
		const implicitVars = WorkflowParser.extractImplicitVariables(content);
		const triggerParams = WorkflowParser.extractTriggerParameters(
			json,
			implicitVars,
		);

		// Get workspace settings to pre-fill global variables
		const config = vscode.workspace.getConfiguration("automa", document.uri);
		const globalVariables = config.get<Record<string, unknown>>(
			"vault.run.globalVariables",
			{},
		);

		for (const varName of implicitVars) {
			let defaultVal = "";
			if (isRecord(globalVariables)) {
				const strippedName = varName.startsWith("$$")
					? varName.slice(2)
					: varName;
				if (globalVariables[varName] !== undefined) {
					defaultVal = String(globalVariables[varName]);
				} else if (globalVariables[strippedName] !== undefined) {
					defaultVal = String(globalVariables[strippedName]);
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
		} catch (_err: unknown) {}
		return "";
	}

	private async renderWebview(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
	): Promise<boolean> {
		try {
			const content = document.getText();
			const json = JSON.parse(content);

			await this.sanitizeDocument(document, json);

			if (
				!(json.drawflow?.nodes && json.drawflow.edges) &&
				Array.isArray(json)
			) {
				webviewPanel.webview.html = `<body><h2>Not an Automa workflow</h2><p>This JSON file does not appear to be an Automa workflow.</p></body>`;
				return false;
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
			return true;
		} catch (error: unknown) {
			const e = toError(error);
			webviewPanel.webview.html = `<body><h2>Error reading workflow</h2><p>${e.message}</p></body>`;
			return false;
		}
	}

	private async postUpdateMessage(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
	) {
		try {
			const content = document.getText();
			const json = JSON.parse(content);

			const triggerParams = await this.prepareTriggerParameters(
				document,
				json,
				content,
			);

			const isPackage =
				json.settings?.asBlock === true ||
				Array.isArray(json.inputs) ||
				Array.isArray(json.outputs);

			webviewPanel.webview.postMessage({
				type: "update",
				json: json,
				triggerParams: triggerParams,
				isPackage: isPackage,
				text: content,
			});
		} catch (_error: unknown) {
			// Ignore parse errors on external edits until fixed
		}
	}

	private async handleSaveWorkflow(
		document: vscode.TextDocument,
		updateData: Record<string, unknown>,
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
					const settingsStr = String(updateData.settings);
					json.settings =
						settingsStr.trim() === "" ? {} : JSON.parse(settingsStr);
				} catch (error: unknown) {
					const e = toError(error);
					throw new Error(`Invalid JSON in Settings: ${e.message}`);
				}
			}
			if (updateData.table !== undefined) {
				try {
					const tableStr = String(updateData.table);
					json.table = tableStr.trim() === "" ? [] : JSON.parse(tableStr);
				} catch (error: unknown) {
					const e = toError(error);
					throw new Error(`Invalid JSON in Table: ${e.message}`);
				}
			}
			if (updateData.includedWorkflows !== undefined) {
				try {
					const workflowsStr = String(updateData.includedWorkflows);
					json.includedWorkflows =
						workflowsStr.trim() === "" ? {} : JSON.parse(workflowsStr);
				} catch (error: unknown) {
					const e = toError(error);
					throw new Error(`Invalid JSON in Included Workflows: ${e.message}`);
				}
			}

			// Update Trigger Parameters Default Values
			if (updateData.triggerParams && (json.drawflow || json.data)) {
				let nodesList: Record<string, unknown>[] = [];
				if (
					hasObjectProp(json, "data") &&
					Array.isArray(getProp<unknown>(json.data, "nodes"))
				) {
					nodesList = castRecordArray(getProp<unknown>(json.data, "nodes"));
				} else if (hasObjectProp(json, "drawflow")) {
					if (Array.isArray(getProp<unknown>(json.drawflow, "nodes"))) {
						nodesList = castRecordArray(castRecord(json.drawflow).nodes);
					} else {
						Object.keys(json.drawflow).forEach((tab) => {
							const tabData = castRecord(castRecord(json.drawflow)[tab]);
							const actualTabData = castRecord(tabData?.data);
							if (actualTabData) {
								Object.entries(actualTabData).forEach(([_key, node]) => {
									nodesList.push(castRecord(node));
								});
							}
						});
					}
				}

				const triggerNode = nodesList.find(
					(n: Record<string, unknown>) =>
						n.label === "trigger" ||
						n.name === "trigger" ||
						n.type === "BlockTrigger",
				);
				if (
					hasObjectProp(triggerNode, "data") &&
					Array.isArray(getProp<unknown>(triggerNode.data, "parameters"))
				) {
					const triggerParamsData = castRecord(updateData.triggerParams);
					for (const param of castRecordArray(
						castRecord(triggerNode.data).parameters,
					)) {
						if (
							triggerParamsData &&
							triggerParamsData[param.name as string] !== undefined
						) {
							param.defaultValue = triggerParamsData[param.name as string];
						}
					}
				}
			}

			// Apply edits to document
			await this.saveDocument(document, JSON.stringify(json, null, 4));

			vscode.window.showInformationMessage("Workflow saved successfully!");
		} catch (error: unknown) {
			const e = toError(error);
			vscode.window.showErrorMessage(`Failed to save workflow: ${e.message}`);
		}
	}

	private processHtmlTemplate(
		templateName: string,
		json: Record<string, unknown>,
		updatedAtStr: string,
		jsonStringifySafe: (obj: unknown) => string,
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

			const safeString = (str: unknown) =>
				str
					? String(str)
							.replace(/\\/g, "\\\\")
							.replace(/`/g, "\\`")
							.replace(/\$\{/g, "\\${")
							.replace(/<\/script>/gi, "<\\/script>")
					: "";

			htmlContent = htmlContent.replace(/\{\{WORKFLOW_NAME\}\}/g, () =>
				String(
					json.name ||
						(templateName.includes("package")
							? "Untitled Package"
							: "Untitled Workflow"),
				),
			);
			htmlContent = htmlContent.replace(
				/\{\{UPDATED_AT_HTML\}\}/g,
				() => updatedAtHtml,
			);
			htmlContent = htmlContent.replace(
				/\{\{JSON_ID\}\}/g,
				() => safeString(json.id) || "N/A",
			);
			htmlContent = htmlContent.replace(/\{\{JSON_NAME\}\}/g, () =>
				safeString(json.name),
			);
			htmlContent = htmlContent.replace(/\{\{JSON_DESCRIPTION\}\}/g, () =>
				safeString(json.description),
			);
			htmlContent = htmlContent.replace(/\{\{JSON_SETTINGS\}\}/g, () =>
				jsonStringifySafe(json.settings),
			);
			htmlContent = htmlContent.replace(/\{\{JSON_ICON\}\}/g, () =>
				String(json.icon || "riGlobalLine"),
			);

			// Additional fields common but maybe not in both, replacing won't hurt if they don't exist in template
			htmlContent = htmlContent.replace(/\{\{JSON_VERSION\}\}/g, () =>
				safeString(json.version),
			);
			htmlContent = htmlContent.replace(/\{\{JSON_EXT_VERSION\}\}/g, () =>
				safeString(json.extVersion),
			);
			htmlContent = htmlContent.replace(/\{\{JSON_GLOBAL_DATA\}\}/g, () =>
				safeString(json.globalData),
			);
			htmlContent = htmlContent.replace(/\{\{JSON_TABLE\}\}/g, () =>
				jsonStringifySafe(json.table),
			);
			htmlContent = htmlContent.replace(
				/\{\{JSON_INCLUDED_WORKFLOWS\}\}/g,
				() => jsonStringifySafe(json.includedWorkflows),
			);

			return htmlContent;
		} catch (error: unknown) {
			const e = toError(error);
			return `<body><h2>Error loading HTML template</h2><pre>${e.message}</pre></body>`;
		}
	}

	private getWorkflowHtml(
		json: Record<string, unknown>,
		triggerParams: Record<string, unknown>[],
		updatedAtStr: string,
		jsonStringifySafe: (obj: unknown) => string,
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
			/\{\{INJECT_PARAMS_DATA\}\}/g,
			() =>
				`const tParams = ${JSON.stringify(triggerParams).replace(/</g, "\\u003c")};\nconst defaultKeepBrowserOpen = ${defaultKeepBrowserOpen};`,
		);

		return htmlContent;
	}

	private getPackageHtml(
		json: Record<string, unknown>,
		pkgInputs: Record<string, unknown>[],
		pkgOutputs: Record<string, unknown>[],
		pkgVars: Record<string, unknown>[],
		triggerParams: Record<string, unknown>[],
		updatedAtStr: string,
		jsonStringifySafe: (obj: unknown) => string,
	): string {
		let htmlContent = this.processHtmlTemplate(
			"package-preview.html",
			json,
			updatedAtStr,
			jsonStringifySafe,
		);

		if (htmlContent.startsWith("<body><h2>Error")) return htmlContent;

		const injectPackageData = `
				const pInputs = ${JSON.stringify(pkgInputs).replace(/</g, "\\u003c")};
				const pOutputs = ${JSON.stringify(pkgOutputs).replace(/</g, "\\u003c")};
				const pVars = ${JSON.stringify(pkgVars).replace(/</g, "\\u003c")};
				const tParams = ${JSON.stringify(triggerParams).replace(/</g, "\\u003c")};
			`;
		htmlContent = htmlContent.replace(
			/\{\{INJECT_PACKAGE_DATA\}\}/g,
			() => injectPackageData,
		);

		return htmlContent;
	}

	private getHtmlContent(
		json: Record<string, unknown>,
		triggerParams: Record<string, unknown>[],
		updatedAtStr: string,
		isPackage: boolean = false,
		pkgInputs: Record<string, unknown>[] = [],
		pkgOutputs: Record<string, unknown>[] = [],
		pkgVars: Record<string, unknown>[] = [],
	): string {
		const jsonStringifySafe = (obj: unknown) =>
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
