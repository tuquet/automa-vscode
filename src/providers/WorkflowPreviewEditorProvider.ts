import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { runWorkflowCommand } from "../commands/runWorkflow";

export class WorkflowPreviewEditorProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = "automa.workflowPreview";

	constructor(private readonly context: vscode.ExtensionContext) {}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		webviewPanel.webview.options = { enableScripts: true };

		const updateWebview = () => {
			try {
				const content = document.getText();
				const json = JSON.parse(content);
				
				let triggerParams: any[] = [];
				const implicitVars = new Set<string>();

				// 1. Scan for {{variables.xyz}}
				const varRegex1 = /\{\{\s*variables\.([a-zA-Z0-9_$]+)\s*\}\}/g;
				let match;
				while ((match = varRegex1.exec(content)) !== null) {
					implicitVars.add(match[1]);
				}

				// 2. Scan for automaRefData('variables', 'xyz')
				const varRegex2 = /automaRefData\(\s*['"]variables['"]\s*,\s*['"]([a-zA-Z0-9_$]+)['"]\s*\)/g;
				while ((match = varRegex2.exec(content)) !== null) {
					implicitVars.add(match[1]);
				}

				if (json.drawflow && json.drawflow.nodes && json.drawflow.edges) {
					const nodesList = json.drawflow.nodes;
					
					// Extract trigger parameters
					for (const node of nodesList) {
						if ((node.label === "trigger" || node.name === "trigger" || node.type === "BlockTrigger") && Array.isArray(node.data?.parameters)) {
							for (const param of node.data.parameters) {
								if (param.name && !triggerParams.some((p) => p.name === param.name)) {
									triggerParams.push(param);
									implicitVars.delete(param.name);
								}
							}
						}
					}
				} else if (Array.isArray(json)) {
					webviewPanel.webview.html = `<body><h2>Not an Automa workflow</h2><p>This JSON file does not appear to be an Automa workflow.</p></body>`;
					return;
				}

				// Get workspace settings to pre-fill global variables
				const config = vscode.workspace.getConfiguration("automa", document.uri);
				const globalVariables = config.get<any>("vault.run.globalVariables", {});

				for (const varName of implicitVars) {
					let defaultVal = "";
					if (globalVariables && typeof globalVariables === 'object' && globalVariables[varName] !== undefined) {
						defaultVal = globalVariables[varName];
					}
					triggerParams.push({
						name: varName,
						description: varName.startsWith('$$') ? '(Auto-detected Global Var)' : '(Auto-detected Implicit Var)',
						defaultValue: defaultVal
					});
				}

				let updatedAt = 0;
				try {
					if (document.uri.scheme === 'file') {
						updatedAt = fs.statSync(document.uri.fsPath).mtimeMs;
					}
				} catch (err) {}

				const isPackage = json.settings?.asBlock === true || Array.isArray(json.inputs) || Array.isArray(json.outputs);
				const pkgInputs = Array.isArray(json.inputs) ? json.inputs : [];
				const pkgOutputs = Array.isArray(json.outputs) ? json.outputs : [];
				const pkgVars = Array.isArray(json.variable) ? json.variable : [];

				webviewPanel.title = `Preview: ${json.name || "Workflow"}`;
				webviewPanel.webview.html = this.getHtmlContent(json, triggerParams, updatedAt, isPackage, pkgInputs, pkgOutputs, pkgVars);
			} catch (e: any) {
				webviewPanel.webview.html = `<body><h2>Error reading workflow</h2><p>${e.message}</p></body>`;
			}
		};

		// Message Listener
		const messageDisposable = webviewPanel.webview.onDidReceiveMessage(async (message) => {
			if (message.command === 'runWorkflow') {
				runWorkflowCommand(document.uri, message.parameters);
			} else if (message.command === 'saveWorkflow') {
				try {
					const content = document.getText();
					const json = JSON.parse(content);
					
					// Update fields
					const updateData = message.data;
					if (updateData.name !== undefined) json.name = updateData.name;
					if (updateData.description !== undefined) json.description = updateData.description;
					if (updateData.version !== undefined) json.version = updateData.version;
					if (updateData.extVersion !== undefined) json.extVersion = updateData.extVersion;
					if (updateData.icon !== undefined) json.icon = updateData.icon;
					if (updateData.globalData !== undefined) json.globalData = updateData.globalData;
					
					// JSON parse for objects/arrays
					try { if (updateData.settings) json.settings = JSON.parse(updateData.settings); } catch(e){}
					try { if (updateData.table) json.table = JSON.parse(updateData.table); } catch(e){}
					try { if (updateData.includedWorkflows) json.includedWorkflows = JSON.parse(updateData.includedWorkflows); } catch(e){}
					
					// Apply edits to document
					const edit = new vscode.WorkspaceEdit();
					edit.replace(
						document.uri,
						new vscode.Range(0, 0, document.lineCount, 0),
						JSON.stringify(json, null, 4)
					);
					await vscode.workspace.applyEdit(edit);
					await document.save();

					vscode.window.showInformationMessage("Workflow saved successfully!");
				} catch (e: any) {
					vscode.window.showErrorMessage("Failed to save workflow: " + e.message);
				}
			} else if (message.command === 'openInStudio') {
				vscode.commands.executeCommand("automa.openInStudio", document.uri);
			}
		});

		const changeDocumentDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString()) {
				updateWebview();
			}
		});

		webviewPanel.onDidDispose(() => {
			messageDisposable.dispose();
			changeDocumentDisposable.dispose();
		});

		// Initial load
		updateWebview();

		// Watch for changes in the document
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				updateWebview();
			}
		});

		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
		});
	}

	private getSharedHeadHtml(): string {
		return `
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Workflow Quick Edit</title>
		<script src="https://cdn.tailwindcss.com"></script>
		<style>
			/* Custom Theme configuration to map VS Code colors to Tailwind */
			:root {
				--vsc-bg: var(--vscode-editor-background);
				--vsc-fg: var(--vscode-editor-foreground);
				--vsc-muted: var(--vscode-descriptionForeground);
				--vsc-border: var(--vscode-panel-border);
				--vsc-widget: var(--vscode-editorWidget-background);
				--vsc-button-bg: var(--vscode-button-background);
				--vsc-button-fg: var(--vscode-button-foreground);
				--vsc-button-hover: var(--vscode-button-hoverBackground);
				--vsc-input-bg: var(--vscode-input-background);
				--vsc-input-fg: var(--vscode-input-foreground);
				--vsc-input-border: var(--vscode-input-border);
				--vsc-link: var(--vscode-textLink-foreground);
			}
			body, html { 
				margin: 0; padding: 0; width: 100%; height: 100%; 
				background-color: var(--vsc-bg);
				color: var(--vsc-fg);
				font-family: var(--vscode-font-family), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			}
			
			/* Custom scrollbar */
			::-webkit-scrollbar { width: 8px; height: 8px; }
			::-webkit-scrollbar-track { background: transparent; }
			::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 4px; }
			::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
			::-webkit-scrollbar-thumb:active { background: var(--vscode-scrollbarSlider-activeBackground); }
		</style>
		<script>
			tailwind.config = {
				theme: {
					extend: {
						colors: {
							vsc: {
								bg: 'var(--vsc-bg)',
								fg: 'var(--vsc-fg)',
								muted: 'var(--vsc-muted)',
								border: 'var(--vsc-border)',
								widget: 'var(--vsc-widget)',
								button: 'var(--vsc-button-bg)',
								buttonHover: 'var(--vsc-button-hover)',
								buttonText: 'var(--vsc-button-fg)',
								input: 'var(--vsc-input-bg)',
								inputText: 'var(--vsc-input-fg)',
								inputBorder: 'var(--vsc-input-border)',
								link: 'var(--vsc-link)',
							}
						}
					}
				}
			}
		</script>
		<!-- Remix Icons and Material Design Icons for Icon Preview -->
		<link href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css" rel="stylesheet" />
		<link href="https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css" rel="stylesheet" />`;
	}

	private getSharedScriptsHtml(currentIcon: string): string {
		return `
			const vscode = acquireVsCodeApi();
	
			// 1. Tab Switching Logic
			function switchTab(tabId) {
				const tabs = ['params', 'global-data', 'settings', 'properties'];
				tabs.forEach(id => {
					const btn = document.getElementById('tabBtn-' + id);
					const content = document.getElementById('tab-' + id);
					if (!btn || !content) return;
					
					if (id === tabId) {
						btn.classList.remove('border-transparent', 'text-vsc-muted');
						btn.classList.add('border-vsc-link', 'text-vsc-link');
						content.classList.remove('hidden');
						content.classList.add('block');
					} else {
						btn.classList.add('border-transparent', 'text-vsc-muted');
						btn.classList.remove('border-vsc-link', 'text-vsc-link');
						content.classList.add('hidden');
						content.classList.remove('block');
					}
				});
			}

			// 2. Icon Select Logic
			const iconsList = [
				'mdiPackageVariantClosed', 'riGlobalLine', 'riFileTextLine', 'riEqualizerLine', 'riTimerLine', 'riCalendarLine', 'riFlashlightLine', 'riLightbulbFlashLine', 'riDatabase2Line', 'riWindowLine', 'riCursorLine', 'riDownloadLine', 'riCommandLine'
			];

			function camelToKebab(str) {
				return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
			}

			const iconSelect = document.getElementById('iconSelect');
			const iconPreviewIcon = document.getElementById('iconPreviewIcon');
			const cIcon = "${currentIcon}";
			
			if (cIcon && !iconsList.includes(cIcon)) {
				iconsList.push(cIcon);
			}

			iconsList.forEach(iconName => {
				const option = document.createElement('option');
				option.value = iconName;
				option.textContent = iconName;
				if (iconName === cIcon) option.selected = true;
				iconSelect.appendChild(option);
			});

			function updateIconPreview() {
				const val = iconSelect.value;
				const kebab = camelToKebab(val);
				if (val.startsWith('mdi')) {
					iconPreviewIcon.className = 'mdi ' + kebab;
				} else {
					iconPreviewIcon.className = kebab;
				}
			}

			iconSelect.addEventListener('change', updateIconPreview);
			updateIconPreview();

			// 3. Handle Save Button
			const saveBtn = document.getElementById('saveBtn');
			if (saveBtn) {
				saveBtn.addEventListener('click', () => {
					const propsForm = document.getElementById('workflowForm');
					const data = {};
					if (propsForm) {
						const formData = new FormData(propsForm);
						for (let [key, value] of formData.entries()) {
							data[key] = value;
						}
					}
					vscode.postMessage({
						command: 'saveWorkflow',
						data: data
					});
				});
			}

			// 4. Handle Open in Studio Button
			const openStudioBtn = document.getElementById('openStudioBtn');
			if (openStudioBtn) {
				openStudioBtn.addEventListener('click', () => {
					vscode.postMessage({
						command: 'openInStudio'
					});
				});
			}`;
	}

	private getWorkflowHtml(json: any, triggerParams: any[], updatedAtStr: string, jsonStringifySafe: (obj: any) => string): string {
		const paramsJson = JSON.stringify(triggerParams).replace(/</g, '\\u003c');
		
		return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			${this.getSharedHeadHtml()}
		</head>
		<body class="flex h-screen flex-col bg-vsc-bg text-vsc-fg font-sans m-0 overflow-hidden">
			
			<!-- Header -->
			<div class="flex items-center justify-between px-6 py-4 border-b border-vsc-border">
				<div>
					<h1 class="text-2xl font-semibold text-vsc-fg truncate max-w-lg" title="${json.name || 'Untitled Workflow'}">${json.name || 'Untitled Workflow'}</h1>
					${updatedAtStr ? `<p class="text-xs text-vsc-muted mt-1 flex items-center gap-1">
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM13 12H17V14H11V7H13V12Z"></path></svg>
						Updated At: ${updatedAtStr}
					</p>` : ''}
				</div>
				
				<div class="flex gap-3 flex-shrink-0">
					<button id="openStudioBtn" class="px-6 py-2 bg-vsc-bg hover:bg-vsc-border text-vsc-fg font-semibold rounded border border-vsc-border transition-colors flex items-center gap-2 shadow-sm" title="Open in Automa Studio (Browser Extension)">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M10 21V23H6C4.89543 23 4 22.1046 4 21V3C4 1.89543 4.89543 1 6 1H18C19.1046 1 20 1.89543 20 3V10H18V3H6V21H10ZM15.5355 12.4645C17.4882 10.5118 20.654 10.5118 22.6066 12.4645C24.5592 14.4171 24.5592 17.5829 22.6066 19.5355L21.1924 18.1213C22.3639 16.9497 22.3639 15.0503 21.1924 13.8787C20.0208 12.7071 18.1213 12.7071 16.9497 13.8787L15.5355 12.4645ZM18.4645 21.5355C16.5118 23.4882 13.346 23.4882 11.3934 21.5355C9.44078 19.5829 9.44078 16.4171 11.3934 14.4645L12.8076 15.8787C11.636 17.0503 11.636 18.9497 12.8076 20.1213C13.9792 21.2929 15.8787 21.2929 17.0503 20.1213L18.4645 21.5355ZM14.8284 14.8284L19.0711 19.0711L17.6569 20.4853L13.4142 16.2426L14.8284 14.8284Z"></path></svg>
						Studio
					</button>
					<button id="saveBtn" class="px-6 py-2 bg-vsc-bg hover:bg-vsc-border text-vsc-fg font-semibold rounded border border-vsc-border transition-colors flex items-center gap-2 shadow-sm">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M7 19v-6h10v6h2V7.828L16.172 5H5v14h2zM4 3h13l4 4v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm5 12v4h6v-4H9z"/></svg>
						Save
					</button>
					<button id="runBtn" class="px-6 py-2 bg-vsc-button hover:bg-vsc-buttonHover text-vsc-buttonText font-semibold rounded shadow transition-colors flex items-center gap-2">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M19.376 12.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832z"/></svg>
						Run
					</button>
				</div>
			</div>

			<!-- Main Tabs Navigation -->
			<div class="flex border-b border-vsc-border px-6 mt-2">
				<button id="tabBtn-params" class="px-4 py-2 border-b-2 border-vsc-link text-vsc-link font-medium" onclick="switchTab('params')">Trigger Parameters</button>
				<button id="tabBtn-global-data" class="px-4 py-2 border-b-2 border-transparent text-vsc-muted hover:text-vsc-fg font-medium" onclick="switchTab('global-data')">Global Data</button>
				<button id="tabBtn-settings" class="px-4 py-2 border-b-2 border-transparent text-vsc-muted hover:text-vsc-fg font-medium" onclick="switchTab('settings')">Settings</button>
				<button id="tabBtn-properties" class="px-4 py-2 border-b-2 border-transparent text-vsc-muted hover:text-vsc-fg font-medium" onclick="switchTab('properties')">Properties</button>
			</div>

			<!-- Content Area -->
			<div class="flex-1 overflow-y-auto relative p-6">
				<!-- PARAMS TAB -->
				<div id="tab-params" class="block max-w-3xl">
					<div id="paramsContainer"></div>
				</div>

				<form id="workflowForm">
					<!-- PROPERTIES TAB -->
					<div id="tab-properties" class="hidden max-w-3xl">
						<div class="flex flex-col gap-4">
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">ID</label>
								<input type="text" value="${json.id || 'N/A'}" readonly class="w-full px-3 py-2 bg-vsc-input text-vsc-muted border border-vsc-inputBorder rounded cursor-not-allowed focus:outline-none">
							</div>
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Name</label>
								<input type="text" name="name" value="${json.name || ''}" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded focus:outline-none focus:border-vsc-button">
							</div>
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Description</label>
								<textarea name="description" rows="3" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded text-sm focus:outline-none focus:border-vsc-button">${json.description || ''}</textarea>
							</div>
							<div class="flex gap-4">
								<div class="flex flex-col gap-1 flex-1">
									<label class="text-xs text-vsc-fg">Version</label>
									<input type="text" name="version" value="${json.version || ''}" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded focus:outline-none focus:border-vsc-button">
								</div>
								<div class="flex flex-col gap-1 flex-1">
									<label class="text-xs text-vsc-fg">ExtVersion</label>
									<input type="text" name="extVersion" value="${json.extVersion || ''}" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded focus:outline-none focus:border-vsc-button">
								</div>
							</div>
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Icon</label>
								<div class="flex items-center gap-2">
									<div class="flex-shrink-0 w-9 h-9 rounded bg-vsc-input border border-vsc-inputBorder flex items-center justify-center text-vsc-fg text-xl shadow-sm">
										<i id="iconPreviewIcon" class=""></i>
									</div>
									<select id="iconSelect" name="icon" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded focus:outline-none focus:border-vsc-button appearance-none cursor-pointer">
										<!-- Options populated by JS -->
									</select>
								</div>
							</div>
						</div>
					</div>

					<!-- GLOBAL DATA TAB -->
					<div id="tab-global-data" class="hidden max-w-3xl">
						<div class="flex flex-col gap-4">
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Global Data (String/JSON)</label>
								<textarea name="globalData" rows="4" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded font-mono text-sm focus:outline-none focus:border-vsc-button">${json.globalData || ''}</textarea>
							</div>
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Table (JSON Array)</label>
								<textarea name="table" rows="5" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded font-mono text-sm focus:outline-none focus:border-vsc-button">${jsonStringifySafe(json.table)}</textarea>
							</div>
						</div>
					</div>

					<!-- SETTINGS TAB -->
					<div id="tab-settings" class="hidden max-w-3xl">
						<div class="flex flex-col gap-4">
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Settings (JSON)</label>
								<textarea name="settings" rows="6" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded font-mono text-sm focus:outline-none focus:border-vsc-button">${jsonStringifySafe(json.settings)}</textarea>
							</div>
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Included Workflows (JSON)</label>
								<textarea name="includedWorkflows" rows="4" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded font-mono text-sm focus:outline-none focus:border-vsc-button">${jsonStringifySafe(json.includedWorkflows)}</textarea>
							</div>
						</div>
					</div>
				</form>
			</div>
		
			<script>
				${this.getSharedScriptsHtml(json.icon || 'riGlobalLine')}

				// Render Workflow Parameters Form
				const tParams = ${paramsJson};
				const paramsContainer = document.getElementById('paramsContainer');
				
				if (tParams.length > 0) {
					let formHtml = '<form id="paramsForm" class="flex flex-col gap-4">';
					tParams.forEach(param => {
						formHtml += '<div class="flex flex-col gap-1">' +
							'<label class="text-sm font-medium text-vsc-fg">' + param.name + '</label>' +
							'<input type="text" required name="' + param.name + '" value="' + (param.defaultValue || '') + '" placeholder="Enter value..." class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded focus:outline-none focus:border-vsc-button">' +
							(param.description ? '<p class="text-xs text-vsc-muted">' + param.description + '</p>' : '') +
							'</div>';
					});
					formHtml += '</form>';
					paramsContainer.innerHTML = formHtml;
				} else {
					paramsContainer.innerHTML = '<div class="flex flex-col items-center justify-center text-vsc-muted mt-20"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor" viewBox="0 0 24 24" class="mb-4"><path d="M11 2.04938V12H2.04938C2.55294 17.0673 6.83067 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C11.6621 3 11.3286 3.01669 11 2.04938ZM13 1.95062C17.4471 2.45422 21 6.33159 21 11H13V1.95062Z"></path></svg><p class="text-lg">No trigger parameters found.</p></div>';
				}

				// Run Button handling
				const runBtn = document.getElementById('runBtn');
				if (runBtn) {
					runBtn.addEventListener('click', () => {
						const form = document.getElementById('paramsForm');
						const params = {};
						if (form) {
							if (!form.checkValidity()) {
								form.reportValidity();
								return;
							}
							const formData = new FormData(form);
							for (let [key, value] of formData.entries()) {
								if (value !== '') {
									params[key] = value;
								}
							}
						}
						vscode.postMessage({
							command: 'runWorkflow',
							parameters: params
						});
					});
				}
			</script>
		</body>
		</html>`;
	}

	private getPackageHtml(json: any, pkgInputs: any[], pkgOutputs: any[], pkgVars: any[], triggerParams: any[], updatedAtStr: string, jsonStringifySafe: (obj: any) => string): string {
		return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			${this.getSharedHeadHtml()}
		</head>
		<body class="flex h-screen flex-col bg-vsc-bg text-vsc-fg font-sans m-0 overflow-hidden">
			
			<!-- Header -->
			<div class="flex items-center justify-between px-6 py-4 border-b border-vsc-border">
				<div>
					<h1 class="text-2xl font-semibold text-vsc-fg truncate max-w-lg flex items-center gap-2" title="${json.name || 'Untitled Package'}">
						${json.name || 'Untitled Package'}
						<span class="text-xs px-2 py-0.5 bg-vsc-button text-vsc-buttonText rounded-full shadow-sm font-medium">Package</span>
					</h1>
					${updatedAtStr ? `<p class="text-xs text-vsc-muted mt-1 flex items-center gap-1">
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM13 12H17V14H11V7H13V12Z"></path></svg>
						Updated At: ${updatedAtStr}
					</p>` : ''}
				</div>
				
				<div class="flex gap-3 flex-shrink-0">
					<button id="openStudioBtn" class="px-6 py-2 bg-vsc-bg hover:bg-vsc-border text-vsc-fg font-semibold rounded border border-vsc-border transition-colors flex items-center gap-2 shadow-sm" title="Open in Automa Studio (Browser Extension)">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M10 21V23H6C4.89543 23 4 22.1046 4 21V3C4 1.89543 4.89543 1 6 1H18C19.1046 1 20 1.89543 20 3V10H18V3H6V21H10ZM15.5355 12.4645C17.4882 10.5118 20.654 10.5118 22.6066 12.4645C24.5592 14.4171 24.5592 17.5829 22.6066 19.5355L21.1924 18.1213C22.3639 16.9497 22.3639 15.0503 21.1924 13.8787C20.0208 12.7071 18.1213 12.7071 16.9497 13.8787L15.5355 12.4645ZM18.4645 21.5355C16.5118 23.4882 13.346 23.4882 11.3934 21.5355C9.44078 19.5829 9.44078 16.4171 11.3934 14.4645L12.8076 15.8787C11.636 17.0503 11.636 18.9497 12.8076 20.1213C13.9792 21.2929 15.8787 21.2929 17.0503 20.1213L18.4645 21.5355ZM14.8284 14.8284L19.0711 19.0711L17.6569 20.4853L13.4142 16.2426L14.8284 14.8284Z"></path></svg>
						Studio
					</button>
					<button id="saveBtn" class="px-6 py-2 bg-vsc-bg hover:bg-vsc-border text-vsc-fg font-semibold rounded border border-vsc-border transition-colors flex items-center gap-2 shadow-sm">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M7 19v-6h10v6h2V7.828L16.172 5H5v14h2zM4 3h13l4 4v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm5 12v4h6v-4H9z"/></svg>
						Save
					</button>
				</div>
			</div>

			<!-- Main Tabs Navigation -->
			<div class="flex border-b border-vsc-border px-6 mt-2">
				<button id="tabBtn-params" class="px-4 py-2 border-b-2 border-vsc-link text-vsc-link font-medium" onclick="switchTab('params')">Package Interface</button>
				<button id="tabBtn-settings" class="px-4 py-2 border-b-2 border-transparent text-vsc-muted hover:text-vsc-fg font-medium" onclick="switchTab('settings')">Settings</button>
				<button id="tabBtn-properties" class="px-4 py-2 border-b-2 border-transparent text-vsc-muted hover:text-vsc-fg font-medium" onclick="switchTab('properties')">Properties</button>
			</div>

			<!-- Content Area -->
			<div class="flex-1 overflow-y-auto relative p-6">
				<!-- PACKAGE INTERFACE TAB -->
				<div id="tab-params" class="block max-w-3xl">
					<div id="paramsContainer"></div>
				</div>

				<form id="workflowForm">
					<!-- PROPERTIES TAB -->
					<div id="tab-properties" class="hidden max-w-3xl">
						<div class="flex flex-col gap-4">
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">ID</label>
								<input type="text" value="${json.id || 'N/A'}" readonly class="w-full px-3 py-2 bg-vsc-input text-vsc-muted border border-vsc-inputBorder rounded cursor-not-allowed focus:outline-none">
							</div>
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Name</label>
								<input type="text" name="name" value="${json.name || ''}" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded focus:outline-none focus:border-vsc-button">
							</div>
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Description</label>
								<textarea name="description" rows="3" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded text-sm focus:outline-none focus:border-vsc-button">${json.description || ''}</textarea>
							</div>
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Icon</label>
								<div class="flex items-center gap-2">
									<div class="flex-shrink-0 w-9 h-9 rounded bg-vsc-input border border-vsc-inputBorder flex items-center justify-center text-vsc-fg text-xl shadow-sm">
										<i id="iconPreviewIcon" class=""></i>
									</div>
									<select id="iconSelect" name="icon" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded focus:outline-none focus:border-vsc-button appearance-none cursor-pointer">
										<!-- Options populated by JS -->
									</select>
								</div>
							</div>
						</div>
					</div>

					<!-- SETTINGS TAB -->
					<div id="tab-settings" class="hidden max-w-3xl">
						<div class="flex flex-col gap-4">
							<div class="flex flex-col gap-1">
								<label class="text-xs text-vsc-fg">Settings (JSON)</label>
								<textarea name="settings" rows="6" class="w-full px-3 py-2 bg-vsc-input text-vsc-inputText border border-vsc-inputBorder rounded font-mono text-sm focus:outline-none focus:border-vsc-button">${jsonStringifySafe(json.settings)}</textarea>
							</div>
						</div>
					</div>
				</form>
			</div>
		
			<script>
				${this.getSharedScriptsHtml(json.icon || 'riGlobalLine')}

				// Render Package Interface
				const pInputs = ${JSON.stringify(pkgInputs)};
				const pOutputs = ${JSON.stringify(pkgOutputs)};
				const pVars = ${JSON.stringify(pkgVars)};
				const tParams = ${JSON.stringify(triggerParams)};
				const paramsContainer = document.getElementById('paramsContainer');
				
				let html = '<div class="flex flex-col gap-6">';
				
				// Inputs
				html += '<div class="flex flex-col gap-2"><h3 class="text-lg font-semibold border-b border-vsc-border pb-1">Inputs</h3>';
				if (pInputs.length > 0) {
					html += '<ul class="flex flex-col gap-2">';
					pInputs.forEach(inp => {
						html += '<li class="flex items-center justify-between p-3 bg-vsc-input border border-vsc-inputBorder rounded shadow-sm"><span class="font-medium">' + inp.name + '</span><span class="text-xs px-2 py-1 bg-vsc-bg rounded text-vsc-muted font-mono">' + (inp.blockId || 'Unknown') + '</span></li>';
					});
					html += '</ul>';
				} else {
					html += '<p class="text-sm text-vsc-muted">No inputs defined.</p>';
				}
				html += '</div>';

				// Outputs
				html += '<div class="flex flex-col gap-2"><h3 class="text-lg font-semibold border-b border-vsc-border pb-1 mt-4">Outputs</h3>';
				if (pOutputs.length > 0) {
					html += '<ul class="flex flex-col gap-2">';
					pOutputs.forEach(out => {
						html += '<li class="flex items-center justify-between p-3 bg-vsc-input border border-vsc-inputBorder rounded shadow-sm"><span class="font-medium">' + out.name + '</span><span class="text-xs px-2 py-1 bg-vsc-bg rounded text-vsc-muted font-mono">' + (out.blockId || 'Unknown') + '</span></li>';
					});
					html += '</ul>';
				} else {
					html += '<p class="text-sm text-vsc-muted">No outputs defined.</p>';
				}
				html += '</div>';

				// Variables
				html += '<div class="flex flex-col gap-2"><h3 class="text-lg font-semibold border-b border-vsc-border pb-1 mt-4">Variables</h3>';
				let hasVars = false;
				let varsHtml = '<ul class="flex flex-col gap-2">';
				
				if (pVars.length > 0) {
					hasVars = true;
					pVars.forEach(v => {
						varsHtml += '<li class="flex items-center justify-between p-3 bg-vsc-input border border-vsc-inputBorder rounded shadow-sm"><div class="flex flex-col"><span class="font-medium text-vsc-fg">' + v.name + '</span><span class="text-xs text-vsc-muted">Explicit Variable</span></div><span class="text-xs px-2 py-1 bg-vsc-bg rounded text-vsc-muted font-mono max-w-[200px] truncate" title="' + (v.value || '""').replace(/"/g, '&quot;') + '">' + (v.value || '""') + '</span></li>';
					});
				}
				
				if (tParams.length > 0) {
					tParams.forEach(v => {
						if (!pVars.some(pv => pv.name === v.name)) {
							hasVars = true;
							varsHtml += '<li class="flex items-center justify-between p-3 bg-vsc-input border border-vsc-inputBorder rounded shadow-sm"><div class="flex flex-col"><span class="font-medium text-vsc-fg">' + v.name + '</span><span class="text-xs text-vsc-muted">' + (v.description || 'Implicit') + '</span></div><span class="text-xs px-2 py-1 bg-vsc-bg rounded text-vsc-muted font-mono max-w-[200px] truncate" title="' + (v.defaultValue || '""').replace(/"/g, '&quot;') + '">' + (v.defaultValue || '""') + '</span></li>';
						}
					});
				}
				varsHtml += '</ul>';

				if (hasVars) {
					html += varsHtml;
				} else {
					html += '<p class="text-sm text-vsc-muted">No variables defined or detected.</p>';
				}
				html += '</div>';

				html += '</div>';
				paramsContainer.innerHTML = html;
			</script>
		</body>
		</html>`;
	}

	private getHtmlContent(json: any, triggerParams: any[], updatedAt: number, isPackage: boolean = false, pkgInputs: any[] = [], pkgOutputs: any[] = [], pkgVars: any[] = []): string {
		const jsonStringifySafe = (obj: any) => obj ? JSON.stringify(obj, null, 2).replace(/</g, '\\u003c').replace(/"/g, '&quot;') : '';
		const updatedAtStr = updatedAt ? new Date(updatedAt).toLocaleString() : '';

		if (isPackage) {
			return this.getPackageHtml(json, pkgInputs, pkgOutputs, pkgVars, triggerParams, updatedAtStr, jsonStringifySafe);
		} else {
			return this.getWorkflowHtml(json, triggerParams, updatedAtStr, jsonStringifySafe);
		}
	}
}
