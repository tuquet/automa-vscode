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
			if (globalVariables && typeof globalVariables === "object") {
				const strippedName = varName.startsWith("$$")
					? varName.slice(2)
					: varName;
				if ((globalVariables[varName] as string) !== undefined) {
					defaultVal = globalVariables[varName] as string;
				} else if ((globalVariables[strippedName] as string) !== undefined) {
					defaultVal = globalVariables[strippedName] as string;
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
	) {
		try {
			const content = document.getText();
			const json = JSON.parse(content) as Record<string, unknown>;

			await this.sanitizeDocument(document, json);

			if (
				(json.drawflow as Record<string, unknown>)?.nodes &&
				(json.drawflow as Record<string, unknown>)?.edges &&
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
				((json as Record<string, unknown>).settings as Record<string, unknown>)
					?.asBlock === true ||
				Array.isArray((json as Record<string, unknown>).inputs) ||
				Array.isArray((json as Record<string, unknown>).outputs);
			const pkgInputs = Array.isArray((json as Record<string, unknown>).inputs)
				? (json as Record<string, unknown>).inputs
				: [];
			const pkgOutputs = Array.isArray(
				(json as Record<string, unknown>).outputs,
			)
				? (json as Record<string, unknown>).outputs
				: [];
			const pkgVars = Array.isArray((json as Record<string, unknown>).variable)
				? (json as Record<string, unknown>).variable
				: [];

			webviewPanel.title = `Preview: ${((json as Record<string, unknown>).name as string) || "Workflow"}`;
			webviewPanel.webview.html = this.getHtmlContent(
				json,
				triggerParams,
				updatedAtStr,
				isPackage,
				pkgInputs as Record<string, unknown>[],
				pkgOutputs as Record<string, unknown>[],
				pkgVars as Record<string, unknown>[],
			);
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			webviewPanel.webview.html = `<body><h2>Error reading workflow</h2><p>${e.message}</p></body>`;
		}
	}

	private async handleSaveWorkflow(
		document: vscode.TextDocument,
		updateData: Record<string, unknown>,
	) {
		try {
			const content = document.getText();
			const json = JSON.parse(content) as Record<string, unknown>;

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
			if ((updateData.settings as string) !== undefined) {
				try {
					json.settings =
						(updateData.settings as string).trim() === ""
							? {}
							: JSON.parse(updateData.settings as string);
				} catch (error: unknown) {
					const e = error instanceof Error ? error : new Error(String(error));
					throw new Error(`Invalid JSON in Settings: ${e.message}`);
				}
			}
			if ((updateData.table as string) !== undefined) {
				try {
					json.table =
						(updateData.table as string).trim() === ""
							? []
							: JSON.parse(updateData.table as string);
				} catch (error: unknown) {
					const e = error instanceof Error ? error : new Error(String(error));
					throw new Error(`Invalid JSON in Table: ${e.message}`);
				}
			}
			if ((updateData.includedWorkflows as string) !== undefined) {
				try {
					json.includedWorkflows =
						(updateData.includedWorkflows as string).trim() === ""
							? {}
							: JSON.parse(updateData.includedWorkflows as string);
				} catch (error: unknown) {
					const e = error instanceof Error ? error : new Error(String(error));
					throw new Error(`Invalid JSON in Included Workflows: ${e.message}`);
				}
			}

			// Update Trigger Parameters Default Values
			if (
				(updateData.triggerParams as Record<string, string>) &&
				(json.drawflow || json.data)
			) {
				let nodesList: Record<string, unknown>[] = [];
				if (
					json.data &&
					Array.isArray((json.data as Record<string, unknown>)?.nodes)
				) {
					nodesList = (json.data as Record<string, unknown>)?.nodes as Record<
						string,
						unknown
					>[];
				} else if (json.drawflow) {
					if (
						Array.isArray((json.drawflow as Record<string, unknown>)?.nodes)
					) {
						nodesList = (json.drawflow as Record<string, unknown>)
							?.nodes as Record<string, unknown>[];
					} else {
						Object.keys(json.drawflow as Record<string, unknown>).forEach(
							(tab) => {
								if ((json.drawflow as Record<string, unknown>)[tab]) {
									Object.entries(
										(
											(json.drawflow as Record<string, unknown>)[tab] as Record<
												string,
												unknown
											>
										).data as Record<string, unknown>,
									).forEach(([_key, node]: [string, unknown]) => {
										nodesList.push(node as Record<string, unknown>);
									});
								}
							},
						);
					}
				}

				const triggerNode = nodesList.find(
					(n: Record<string, unknown>) =>
						n.label === "trigger" ||
						n.name === "trigger" ||
						n.type === "BlockTrigger",
				);
				if (
					triggerNode &&
					Array.isArray(
						(triggerNode.data as Record<string, unknown>)?.parameters,
					)
				) {
					for (const param of (triggerNode.data as Record<string, unknown>)
						.parameters as unknown[]) {
						if (
							(updateData.triggerParams as Record<string, string>)[
								(param as Record<string, unknown>).name as string
							] !== undefined
						) {
							(param as Record<string, unknown>).defaultValue = (
								updateData.triggerParams as Record<string, string>
							)[(param as Record<string, unknown>).name as string];
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

			htmlContent = htmlContent.replace(
				/\{\{WORKFLOW_NAME\}\}/g,
				((json as Record<string, unknown>).name as string) ||
					(templateName.includes("package")
						? "Untitled Package"
						: "Untitled Workflow"),
			);
			htmlContent = htmlContent.replace("{{UPDATED_AT_HTML}}", updatedAtHtml);
			htmlContent = htmlContent.replace(
				"{{JSON_ID}}",
				safeString((json as Record<string, unknown>).id) || "N/A",
			);
			htmlContent = htmlContent.replace(
				"{{JSON_NAME}}",
				safeString((json as Record<string, unknown>).name as string),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_DESCRIPTION}}",
				safeString((json as Record<string, unknown>).description),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_SETTINGS}}",
				jsonStringifySafe((json as Record<string, unknown>).settings),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_ICON}}",
				((json as Record<string, unknown>).icon as string) || "riGlobalLine",
			);

			// Additional fields common but maybe not in both, replacing won't hurt if they don't exist in template
			htmlContent = htmlContent.replace(
				"{{JSON_VERSION}}",
				safeString((json as Record<string, unknown>).version),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_EXT_VERSION}}",
				safeString((json as Record<string, unknown>).extVersion),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_GLOBAL_DATA}}",
				safeString((json as Record<string, unknown>).globalData),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_TABLE}}",
				jsonStringifySafe((json as Record<string, unknown>).table),
			);
			htmlContent = htmlContent.replace(
				"{{JSON_INCLUDED_WORKFLOWS}}",
				jsonStringifySafe((json as Record<string, unknown>).includedWorkflows),
			);

			return htmlContent;
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
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
			"{{INJECT_PARAMS_DATA}}",
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
