import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";

export class LogCustomEditorProvider implements vscode.CustomReadonlyEditorProvider {
	public static readonly viewType = "automa.logEditor";

	constructor(private readonly context: vscode.ExtensionContext) {}

	public async openCustomDocument(
		uri: vscode.Uri,
		openContext: vscode.CustomDocumentOpenContext,
		token: vscode.CancellationToken
	): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => {} };
	}

	public async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
		token: vscode.CancellationToken
	): Promise<void> {
		webviewPanel.webview.options = { enableScripts: true };
		
		const updateWebview = async (isInitial = false) => {
			try {
				const content = await fs.readFile(document.uri.fsPath, "utf-8");
				const parsed = JSON.parse(content);
				const job = parsed.job || { name: "Unknown Workflow", id: "N/A", status: "unknown" };
				const logs = parsed.logs || [];
				const results = parsed.results || { table: [], variables: {} };

				job.results = results;
				webviewPanel.webview.html = getWebviewContent(job, logs);
			} catch (error: any) {
				if (isInitial) {
					webviewPanel.webview.html = `
						<!DOCTYPE html>
						<html>
							<head><style>body{color:red; font-family:sans-serif; padding: 20px;}</style></head>
							<body>
								<h2>Failed to load Automa Log</h2>
								<pre>${error.message}</pre>
							</body>
						</html>
					`;
				}
				// If not initial, ignore parse errors (might be mid-write)
			}
		};

		await updateWebview(true);

		// Watch the file for real-time updates
		try {
			const watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
			
			const handleChange = () => {
				// Small delay to allow file write to finish
				setTimeout(() => updateWebview(false), 50);
			};

			const changeDisposable = watcher.onDidChange(handleChange);
			const createDisposable = watcher.onDidCreate(handleChange);

			webviewPanel.onDidDispose(() => {
				changeDisposable.dispose();
				createDisposable.dispose();
				watcher.dispose();
			});
		} catch (watchErr) {
			console.warn("Failed to watch log file for real-time updates:", watchErr);
		}
	}
}

function getWebviewContent(job: any, logs: any[]) {
	// Prepare data to send to webview
	const logsJson = JSON.stringify(logs).replace(/</g, '\\u003c');
	const jobJson = JSON.stringify(job).replace(/</g, '\\u003c');

    // Format created_at nicely
    let formattedCreated = job.created_at;
    if (job.created_at) {
        try {
            const date = new Date(job.created_at);
            formattedCreated = date.toLocaleString('vi-VN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (e) {}
    }

    let jobStatusColor = 'text-vsc-fg';
    if (job.status === 'error' || job.status === 'failed') jobStatusColor = 'text-vsc-error';
    else if (job.status === 'success') jobStatusColor = 'text-vsc-success';
    else if (job.status === 'stopped' || job.status === 'stop') jobStatusColor = 'text-vsc-warning';

	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Automa Logs</title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              vsc: {
                bg: 'var(--vscode-editor-background)',
                fg: 'var(--vscode-editor-foreground)',
                widget: 'var(--vscode-editorWidget-background)',
                border: 'var(--vscode-panel-border)',
                borderLight: 'var(--vscode-widget-border)',
                hoverBg: 'var(--vscode-list-hoverBackground)',
                hoverFg: 'var(--vscode-list-hoverForeground)',
                activeBg: 'var(--vscode-list-activeSelectionBackground)',
                activeFg: 'var(--vscode-list-activeSelectionForeground)',
                inputBg: 'var(--vscode-input-background)',
                inputFg: 'var(--vscode-input-foreground)',
                inputBorder: 'var(--vscode-input-border)',
                link: 'var(--vscode-textLink-foreground)',
                success: 'var(--vscode-testing-iconPassed)',
                error: 'var(--vscode-testing-iconFailed)',
                warning: 'var(--vscode-testing-iconQueued)',
                muted: 'var(--vscode-descriptionForeground)'
              }
            }
          }
        }
      }
    </script>
    <!-- Remix Icons -->
    <link href="https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css" rel="stylesheet" />
    <!-- Highlight.js for JSON -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>

    <style>
        body {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
            margin: 0;
            padding: 0;
            height: 100vh;
            overflow: hidden;
        }
        
        .bg-box-transparent {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        
        /* Custom scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }
        ::-webkit-scrollbar-thumb:active {
            background: var(--vscode-scrollbarSlider-activeBackground);
        }

        .line-clamp {
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;  
            overflow: hidden;
        }

        .ctx-data-table td {
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .ctx-data-table tr:last-child td {
            border-bottom: none;
        }

        pre code.hljs {
            border-radius: 6px;
            padding: 12px;
            font-size: 13px;
            font-family: var(--vscode-editor-font-family), "Consolas", "Courier New", monospace;
            background: transparent;
        }
    </style>
</head>
<body class="flex h-screen flex-col bg-vsc-bg text-vsc-fg font-sans m-0 overflow-hidden">
        <!-- Header -->
        <div class="flex items-center px-6 py-4 border-b border-vsc-border">
            <div>
                <h1 class="text-2xl font-semibold text-vsc-fg truncate max-w-lg" title="${job.name}">${job.name}</h1>
                <p class="text-sm text-vsc-muted mt-1 flex items-center gap-2">
                    Status: <span class="uppercase text-xs font-bold px-2 py-0.5 rounded border border-vsc-borderLight bg-vsc-widget ${jobStatusColor}">${job.status}</span> 
                    | ${formattedCreated}
                </p>
            </div>
        </div>

        <!-- Main Tabs Navigation -->
        <div class="flex border-b border-vsc-border px-6 mt-2">
            <button id="tabBtn-logs" class="px-4 py-2 border-b-2 border-vsc-link text-vsc-link font-medium" onclick="switchMainTab('logs')">Logs</button>
            <button id="tabBtn-table" class="px-4 py-2 border-b-2 border-transparent text-vsc-muted hover:text-vsc-fg font-medium" onclick="switchMainTab('table')">Table</button>
            <button id="tabBtn-variables" class="px-4 py-2 border-b-2 border-transparent text-vsc-muted hover:text-vsc-fg font-medium" onclick="switchMainTab('variables')">Variables</button>
        </div>

        <!-- Content Area -->
        <div class="flex-1 overflow-hidden relative">
            
            <!-- LOGS TAB -->
            <div id="tab-logs" class="absolute inset-0 flex">
                <!-- Left Panel: History List -->
                <div class="w-1/2 flex flex-col border-r border-vsc-border bg-vsc-widget">
                    <!-- Search Box -->
                    <div class="p-4 border-b border-vsc-border">
                        <div class="relative">
                            <i class="ri-search-2-line absolute left-3 top-1/2 -translate-y-1/2 text-vsc-muted"></i>
                            <input type="text" id="searchInput" placeholder="Search logs..." 
                                class="w-full bg-vsc-inputBg text-sm text-vsc-inputFg placeholder-vsc-muted rounded-md py-1.5 pl-9 pr-3 focus:outline-none focus:ring-1 focus:ring-vsc-link transition-shadow border border-vsc-inputBorder">
                        </div>
                    </div>
                    <!-- Logs List -->
                    <div id="logList" class="flex-1 overflow-y-auto p-2 space-y-1">
                        <!-- Populated by JS -->
                    </div>
                </div>

                <!-- Right Panel: Log Details -->
                <div class="w-1/2 flex flex-col bg-vsc-bg">
                    <div id="detailPanel" class="hidden flex-col h-full p-6 overflow-y-auto">
                        <h2 class="text-lg font-semibold text-vsc-fg mb-4">Log Details</h2>
                        
                        <table class="w-full text-sm mb-6">
                            <thead class="hidden">
                                <tr>
                                    <td class="w-1/3"></td>
                                    <td></td>
                                </tr>
                            </thead>
                            <tbody id="detailTableBody">
                                <!-- Populated by JS -->
                            </tbody>
                        </table>

                        <div class="flex items-center mb-2">
                            <p class="font-semibold text-vsc-fg">Log data (ctxData)</p>
                        </div>
                        
                        <div class="flex-1 bg-[#1e1e1e] rounded-md border border-vsc-borderLight overflow-hidden flex flex-col" style="max-height: 460px;">
                            <pre class="m-0 flex-1 overflow-auto"><code id="jsonViewer" class="language-json w-full h-full block"></code></pre>
                        </div>
                    </div>
                    <div id="emptyDetailPanel" class="flex flex-col items-center justify-center h-full text-vsc-muted">
                        <i class="ri-file-list-3-line text-4xl mb-2"></i>
                        <p>Select a log to view details</p>
                    </div>
                </div>
            </div>

            <!-- TABLE TAB -->
            <div id="tab-table" class="hidden absolute inset-0 flex-col p-6 overflow-auto bg-vsc-bg">
                <div id="tableContainer"></div>
            </div>

            <!-- VARIABLES TAB -->
            <div id="tab-variables" class="hidden absolute inset-0 flex-col p-6 overflow-auto bg-vsc-bg">
                <div id="variablesContainer" class="max-w-4xl"></div>
            </div>
        </div>

    <script>
        const logsData = ${logsJson};
        const jobData = ${jobJson};
        const results = jobData.results || { table: [], variables: {} };
        const jobTable = results.table || [];
        const jobVars = results.variables || {};
        
        let activeLogId = null;
        let filteredLogs = [];

        // In the new flat JSON format, log objects are already fully parsed
        const parsedLogs = logsData.map(log => {
            return {
                ...log,
                parsedMsg: log
            };
        });

        const listContainer = document.getElementById('logList');
        const detailPanel = document.getElementById('detailPanel');
        const detailTableBody = document.getElementById('detailTableBody');
        const jsonViewer = document.getElementById('jsonViewer');
        const searchInput = document.getElementById('searchInput');

        function formatTime(isoString) {
            if (!isoString) return '';
            const date = new Date(isoString);
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            const ss = String(date.getSeconds()).padStart(2, '0');
            return \`\${hh}:\${mm}:\${ss}\`;
        }

        function getIconAndColor(status, type) {
            const state = status || type || 'success';
            if (state === 'error') {
                return { icon: 'ri-error-warning-line', color: 'text-vsc-error' };
            }
            if (state === 'stop' || state === 'stopped') {
                return { icon: 'ri-stop-line', color: 'text-vsc-warning' };
            }
            return { icon: 'ri-check-line', color: 'text-vsc-success' };
        }

        function renderLogList(data, searchQuery = '') {
            listContainer.innerHTML = '';
            
            filteredLogs = parsedLogs.filter(log => {
                const msg = log.parsedMsg;
                const name = msg.name || msg.blockId || '';
                const desc = msg.description || '';
                const text = msg.message || '';
                const q = searchQuery.toLowerCase();
                return name.toLowerCase().includes(q) || desc.toLowerCase().includes(q) || text.toLowerCase().includes(q);
            });

            if (filteredLogs.length === 0) {
                listContainer.innerHTML = '<div class="text-center text-vsc-muted mt-10">No logs match your search.</div>';
                return;
            }

            filteredLogs.forEach((log, index) => {
                const msg = log.parsedMsg;
                const itemDiv = document.createElement('div');
                itemDiv.className = \`group flex w-full cursor-pointer items-start rounded-md px-2 py-1.5 text-left focus:outline-none hover:bg-vsc-hoverBg hover:text-vsc-hoverFg transition-colors \${activeLogId === index ? 'bg-box-transparent' : 'text-vsc-fg'}\`;
                
                const timestamp = msg.timestamp || log.created_at;
                const timeStr = formatTime(timestamp);
                const duration = msg.duration ? \`(\${msg.duration}ms)\` : '';
                const { icon, color } = getIconAndColor(msg.status, msg.type);
                
                const name = msg.name || msg.blockId || 'unknown';
                const desc = msg.description || '';
                const errorText = msg.message ? msg.message : '';

                itemDiv.innerHTML = \`
                    <div class="mr-4 shrink-0 text-vsc-muted w-32" title="\${timestamp || ''}">
                        \${timeStr} \${duration}
                    </div>
                    <span class="w-2/12 shrink-0 \${color} truncate flex items-center gap-1" title="\${msg.type || msg.status || 'success'}">
                        <i class="\${icon} text-lg"></i>
                        \${name}
                    </span>
                    <span class="ml-2 w-2/12 shrink-0 text-vsc-muted truncate" title="\${desc}">
                        \${desc}
                    </span>
                    <p class="line-clamp ml-2 flex-1 text-vsc-muted" title="\${errorText.replace(/"/g, '&quot;')}">
                        \${errorText}
                    </p>
                \`;

                itemDiv.onclick = (e) => {
                    if (window.getSelection().toString().length > 0) return; // Allow text selection
                    selectLog(index);
                };
                listContainer.appendChild(itemDiv);
            });
        }

        function selectLog(index) {
            activeLogId = index;
            
            // Update selection style without re-rendering the whole DOM
            Array.from(listContainer.children).forEach((child, i) => {
                if (i === index) {
                    child.classList.add('bg-box-transparent');
                    child.classList.remove('text-vsc-fg');
                } else {
                    child.classList.remove('bg-box-transparent');
                    child.classList.add('text-vsc-fg');
                }
            });
            
            const log = filteredLogs[index];
            const msg = log.parsedMsg;
            
            detailPanel.classList.remove('hidden');
            detailPanel.classList.add('flex');
            document.getElementById('emptyDetailPanel').classList.add('hidden');

            const timestamp = msg.timestamp || log.created_at;
            const timeStr = formatTime(timestamp);
            const duration = msg.duration ? \`\${msg.duration}ms\` : '';
            const status = String(msg.status || msg.type || 'Success').toUpperCase();

            detailTableBody.innerHTML = \`
                <tr>
                    <td class="text-vsc-muted">Name</td>
                    <td class="text-vsc-fg font-medium">\${msg.name || msg.blockId || 'unknown'}</td>
                </tr>
                \${msg.description ? \`
                <tr>
                    <td class="text-vsc-muted">Description</td>
                    <td class="text-vsc-fg">\${msg.description}</td>
                </tr>\` : ''}
                <tr>
                    <td class="text-vsc-muted">Status</td>
                    <td class="text-vsc-fg">\${status}</td>
                </tr>
                <tr>
                    <td class="text-vsc-muted">Time</td>
                    <td class="text-vsc-fg">\${timeStr} \${duration ? ' / ' + duration : ''}</td>
                </tr>
                \${msg.message ? \`
                <tr>
                    <td class="text-vsc-muted align-top">Message</td>
                    <td class="text-vsc-error break-words">\${msg.message}</td>
                </tr>\` : ''}
            \`;

            // Render JSON
            const ctxData = msg.ctxData || msg;
            jsonViewer.textContent = JSON.stringify(ctxData, null, 2);
            jsonViewer.removeAttribute('data-highlighted');
            hljs.highlightElement(jsonViewer);
        }

        function renderTable() {
            const container = document.getElementById('tableContainer');
            if (!jobTable || jobTable.length === 0) {
                container.innerHTML = '<div class="flex flex-col items-center justify-center text-vsc-muted mt-20"><i class="ri-folder-open-line text-6xl mb-4"></i><p class="text-xl font-semibold">No Data</p></div>';
                return;
            }
            
            // Layout with Sub-Tabs (Table / Raw) and Search
            let html = \`
                <div class="flex items-center mb-4">
                    <div class="flex bg-vsc-widget rounded-md p-1 border border-vsc-borderLight">
                        <button id="subtabBtn-table-grid" class="px-3 py-1 rounded bg-vsc-bg text-vsc-fg text-sm font-medium transition-colors" onclick="switchTableSubTab('grid')">Table</button>
                        <button id="subtabBtn-table-raw" class="px-3 py-1 rounded text-vsc-muted hover:text-vsc-fg text-sm font-medium transition-colors" onclick="switchTableSubTab('raw')">Raw</button>
                    </div>
                    <div class="grow"></div>
                    <div id="tableSearchWrapper" class="relative">
                        <i class="ri-search-2-line absolute left-3 top-1/2 -translate-y-1/2 text-vsc-muted"></i>
                        <input type="text" id="tableSearchInput" placeholder="Search..." 
                            class="w-48 bg-vsc-inputBg text-sm text-vsc-inputFg placeholder-vsc-muted rounded-md py-1.5 pl-9 pr-3 focus:outline-none focus:ring-1 focus:ring-vsc-link transition-shadow border border-vsc-inputBorder">
                    </div>
                </div>
                <div id="tableSubTab-grid" class="flex-1 overflow-x-auto bg-vsc-widget rounded-md border border-vsc-borderLight">
                    <table class="w-full text-left text-sm whitespace-nowrap">
                        <thead class="bg-vsc-bg text-vsc-muted" id="tableThead"></thead>
                        <tbody class="text-vsc-fg" id="tableTbody"></tbody>
                    </table>
                </div>
                <div id="tableSubTab-raw" class="hidden flex-1 bg-[#1e1e1e] rounded-md border border-vsc-borderLight overflow-hidden flex-col">
                    <pre class="m-0 flex-1 overflow-auto p-4"><code class="language-json w-full h-full block">\${JSON.stringify(jobTable, null, 2).replace(/"/g, '&quot;')}</code></pre>
                </div>
            \`;
            
            container.innerHTML = html;
            
            // Add search event
            document.getElementById('tableSearchInput')?.addEventListener('input', (e) => {
                renderTableGrid(e.target.value);
            });
            renderTableGrid(''); // initial render
        }

        function renderTableGrid(query) {
            const tbody = document.getElementById('tableTbody');
            const thead = document.getElementById('tableThead');
            if (!tbody || !thead) return;

            const q = query.toLowerCase();
            const filteredTable = jobTable.filter(row => {
                return Object.values(row).some(v => String(v).toLowerCase().includes(q));
            });

            const headers = Array.from(new Set(jobTable.reduce((acc, row) => acc.concat(Object.keys(row)), [])));
            
            let theadHtml = '<tr><th class="px-4 py-2 border-b border-vsc-border font-semibold w-16">id</th>';
            headers.forEach(h => {
                theadHtml += \`<th class="px-4 py-2 border-b border-vsc-border font-semibold">\${h}</th>\`;
            });
            theadHtml += '</tr>';
            thead.innerHTML = theadHtml;
            
            let tbodyHtml = '';
            filteredTable.forEach((row, idx) => {
                tbodyHtml += '<tr class="hover:bg-vsc-hoverBg hover:text-vsc-hoverFg transition-colors">';
                tbodyHtml += \`<td class="px-4 py-2 border-b border-vsc-border text-vsc-muted">\${idx + 1}</td>\`;
                headers.forEach(h => {
                    let val = row[h] !== undefined ? row[h] : '';
                    if (typeof val === 'object') val = JSON.stringify(val);
                    tbodyHtml += \`<td class="px-4 py-2 border-b border-vsc-border">\${val}</td>\`;
                });
                tbodyHtml += '</tr>';
            });
            tbody.innerHTML = tbodyHtml;
        }

        function renderVariables() {
            const container = document.getElementById('variablesContainer');
            const keys = Object.keys(jobVars);
            if (keys.length === 0) {
                document.getElementById('tab-variables').innerHTML = '<div class="flex flex-col items-center justify-center text-vsc-muted mt-20 w-full"><i class="ri-folder-open-line text-6xl mb-4"></i><p class="text-xl font-semibold">No Data</p></div>';
                return;
            }
            
            let html = \`
                <div class="flex items-center mb-4 w-full">
                    <div class="flex bg-vsc-widget rounded-md p-1 border border-vsc-borderLight">
                        <button id="subtabBtn-vars-gui" class="px-3 py-1 rounded bg-vsc-bg text-vsc-fg text-sm font-medium transition-colors" onclick="switchVarsSubTab('gui')">GUI</button>
                        <button id="subtabBtn-vars-raw" class="px-3 py-1 rounded text-vsc-muted hover:text-vsc-fg text-sm font-medium transition-colors" onclick="switchVarsSubTab('raw')">Raw</button>
                    </div>
                </div>
                <div id="varsSubTab-gui" class="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
            \`;
            
            keys.forEach(key => {
                let val = jobVars[key];
                let valStr = typeof val === 'string' ? val : JSON.stringify(val);
                html += \`
                    <div class="flex items-center space-x-2 rounded-lg border-2 border-vsc-borderLight bg-vsc-widget px-2 pb-2 pt-1">
                        <div class="w-full">
                            <label class="text-xs text-vsc-muted font-semibold uppercase tracking-wider mb-1 block">Name</label>
                            <input type="text" readonly value="\${key.replace(/"/g, '&quot;')}" class="w-full bg-vsc-inputBg border border-vsc-inputBorder rounded px-2 py-1.5 text-sm text-vsc-inputFg focus:outline-none">
                        </div>
                        <div class="w-full">
                            <label class="text-xs text-vsc-muted font-semibold uppercase tracking-wider mb-1 block">Value</label>
                            <input type="text" readonly value="\${valStr.replace(/"/g, '&quot;')}" class="w-full bg-vsc-inputBg border border-vsc-inputBorder rounded px-2 py-1.5 text-sm text-vsc-inputFg focus:outline-none">
                        </div>
                    </div>
                \`;
            });
            
            html += \`
                </div>
                <div id="varsSubTab-raw" class="hidden w-full flex-1 bg-[#1e1e1e] rounded-md border border-vsc-borderLight overflow-hidden flex-col">
                    <pre class="m-0 flex-1 overflow-auto p-4"><code class="language-json w-full h-full block">\${JSON.stringify(jobVars, null, 2).replace(/"/g, '&quot;')}</code></pre>
                </div>
            \`;
            
            container.innerHTML = html;
        }

        function switchTableSubTab(tab) {
            if (tab === 'grid') {
                document.getElementById('subtabBtn-table-grid').classList.replace('text-vsc-muted', 'text-vsc-fg');
                document.getElementById('subtabBtn-table-grid').classList.add('bg-vsc-bg');
                document.getElementById('subtabBtn-table-raw').classList.replace('text-vsc-fg', 'text-vsc-muted');
                document.getElementById('subtabBtn-table-raw').classList.remove('bg-vsc-bg');
                document.getElementById('tableSubTab-grid').classList.remove('hidden');
                document.getElementById('tableSubTab-grid').classList.add('flex-1');
                document.getElementById('tableSearchWrapper').classList.remove('hidden');
                document.getElementById('tableSubTab-raw').classList.add('hidden');
                document.getElementById('tableSubTab-raw').classList.remove('flex-1');
            } else {
                document.getElementById('subtabBtn-table-raw').classList.replace('text-vsc-muted', 'text-vsc-fg');
                document.getElementById('subtabBtn-table-raw').classList.add('bg-vsc-bg');
                document.getElementById('subtabBtn-table-grid').classList.replace('text-vsc-fg', 'text-vsc-muted');
                document.getElementById('subtabBtn-table-grid').classList.remove('bg-vsc-bg');
                document.getElementById('tableSubTab-raw').classList.remove('hidden');
                document.getElementById('tableSubTab-raw').classList.add('flex-1');
                document.getElementById('tableSearchWrapper').classList.add('hidden');
                document.getElementById('tableSubTab-grid').classList.add('hidden');
                document.getElementById('tableSubTab-grid').classList.remove('flex-1');
                document.querySelectorAll('#tableSubTab-raw code').forEach(el => hljs.highlightElement(el));
            }
        }

        function switchVarsSubTab(tab) {
            if (tab === 'gui') {
                document.getElementById('subtabBtn-vars-gui').classList.replace('text-vsc-muted', 'text-vsc-fg');
                document.getElementById('subtabBtn-vars-gui').classList.add('bg-vsc-bg');
                document.getElementById('subtabBtn-vars-raw').classList.replace('text-vsc-fg', 'text-vsc-muted');
                document.getElementById('subtabBtn-vars-raw').classList.remove('bg-vsc-bg');
                document.getElementById('varsSubTab-gui').classList.remove('hidden');
                document.getElementById('varsSubTab-gui').classList.add('grid');
                document.getElementById('varsSubTab-raw').classList.add('hidden');
                document.getElementById('varsSubTab-raw').classList.remove('flex-1');
            } else {
                document.getElementById('subtabBtn-vars-raw').classList.replace('text-vsc-muted', 'text-vsc-fg');
                document.getElementById('subtabBtn-vars-raw').classList.add('bg-vsc-bg');
                document.getElementById('subtabBtn-vars-gui').classList.replace('text-vsc-fg', 'text-vsc-muted');
                document.getElementById('subtabBtn-vars-gui').classList.remove('bg-vsc-bg');
                document.getElementById('varsSubTab-raw').classList.remove('hidden');
                document.getElementById('varsSubTab-raw').classList.add('flex-1');
                document.getElementById('varsSubTab-gui').classList.add('hidden');
                document.getElementById('varsSubTab-gui').classList.remove('grid');
                document.querySelectorAll('#varsSubTab-raw code').forEach(el => hljs.highlightElement(el));
            }
        }

        function switchMainTab(tabId) {
            const tabs = ['logs', 'table', 'variables'];
            tabs.forEach(t => {
                const isSelected = t === tabId;
                
                // Toggle content
                const el = document.getElementById('tab-' + t);
                if (el) {
                    if (isSelected) el.classList.remove('hidden');
                    else el.classList.add('hidden');
                }
                
                // Toggle active button style
                const btn = document.getElementById('tabBtn-' + t);
                if (btn) {
                    if (isSelected) {
                        btn.classList.remove('border-transparent', 'text-vsc-muted');
                        btn.classList.add('border-vsc-link', 'text-vsc-link');
                    } else {
                        btn.classList.remove('border-vsc-link', 'text-vsc-link');
                        btn.classList.add('border-transparent', 'text-vsc-muted');
                    }
                }
            });
        }

        // Initialize UI
        renderLogList(logsData);
        renderTable();
        renderVariables();
        
        // Highlight JSON
        hljs.highlightAll();
        
        searchInput.addEventListener('input', (e) => renderLogList(logsData, e.target.value));
    </script>
</body>
</html>`;
}
