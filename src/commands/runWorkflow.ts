import * as path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";

let automaOutputChannel: vscode.OutputChannel;

export async function runWorkflowCommand(nodeOrUri?: any, params?: any) {
	let targetPath = "";
	let displayName = "";
	let workflowData: any = null;

	if (nodeOrUri?.fsPath) {
		targetPath = nodeOrUri.fsPath;
		displayName = path.basename(nodeOrUri.fsPath);
	} else if (nodeOrUri?.fullPath) {
		targetPath = nodeOrUri.fullPath;
		displayName = nodeOrUri.label;
	} else {
		const input = await vscode.window.showInputBox({
			prompt: "Enter absolute path to workflow JSON",
			placeHolder: "e.g. C:\\path\\to\\workflow.json",
		});
		if (!input) return;

		targetPath = input;
		displayName = input;
	}

	if (!targetPath.endsWith(".json")) {
		vscode.window.showErrorMessage("Cloud workflows are not supported yet via API.");
		return;
	}

	try {
		const fileContent = fs.readFileSync(targetPath, "utf-8");
		workflowData = JSON.parse(fileContent);
	} catch (e: any) {
		vscode.window.showErrorMessage(`Failed to read workflow file: ${e.message}`);
		return;
	}

	const config = vscode.workspace.getConfiguration("automa");
	
	const keepBrowserOpen = !config.get<boolean>("vault.run.closeBrowserOnFinish", true);

	const options: any = {
		useDefaultParameters: config.get<boolean>("run.useDefaultParameters"),
		logPath: config.get<string>("vault.run.logPath"),
		debug: config.get<boolean>("vault.run.debug"),
		variables: params ? params : undefined,
		browserSettings: {
			headless: config.get<boolean>("vault.run.headless"),
			closeBrowserOnFinish: !keepBrowserOpen,
			defaultBrowser: config.get<string>("vault.run.defaultBrowser"),
		}
	};

	vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `Automa: Running ${displayName}...`,
		cancellable: false
	}, async (progress) => {
		if (!automaOutputChannel) {
			automaOutputChannel = vscode.window.createOutputChannel("Automa Execution");
		}
		automaOutputChannel.show(true);
		automaOutputChannel.appendLine(`\n--- Starting Workflow: ${displayName} [${new Date().toLocaleTimeString()}] ---`);

		progress.report({ increment: 0, message: "Starting via daemon..." });
		
		try {
			// Ensure daemon is started and get the current port
			await DaemonManager.getInstance().start();
			const port = DaemonManager.getInstance().getPort();
			
			// Trigger run
			const runRes = await fetch(`http://localhost:${port}/api/jobs/run`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workflowData, options })
			});

			if (!runRes.ok) {
				const err = await runRes.json() as any;
				throw new Error(err.error || "Unknown error starting job");
			}

			const runData = await runRes.json() as any;
			const jobId = runData.jobId;

			progress.report({ increment: 20, message: "Executing..." });

			// Poll for status (Request Stacking protection via async while loop)
			return new Promise<void>((resolve, reject) => {
				let isPolling = true;
				let isTimedOut = false;

				// Safety timeout: 10 minutes
				const timeoutTimer = setTimeout(() => {
					isTimedOut = true;
					isPolling = false;
					reject(new Error("Workflow execution timed out waiting for status."));
				}, 10 * 60 * 1000);

				const pollStatus = async () => {
					let lastLogIndex = 0;

					const fetchLogs = async () => {
						try {
							const logsRes = await fetch(`http://localhost:${port}/api/jobs/${jobId}/logs`);
							if (logsRes.ok) {
								const logsData = await logsRes.json() as any;
								const logs = logsData.logs || [];
								for (let i = lastLogIndex; i < logs.length; i++) {
									automaOutputChannel.appendLine(`[${logs[i].type.toUpperCase()}] ${logs[i].message}`);
								}
								lastLogIndex = logs.length;
							}
						} catch (e) { }
					};

					while (isPolling) {
						await fetchLogs();

						try {
							const statusRes = await fetch(`http://localhost:${port}/api/jobs/${jobId}/status`);
							if (statusRes.ok) {
								const statusData = await statusRes.json() as any;
								if (statusData.status === "completed" || statusData.status === "failed" || statusData.status === "error") {
									isPolling = false;
									clearTimeout(timeoutTimer);
									await fetchLogs(); // Final log fetch

									if (statusData.status === "completed") {
										automaOutputChannel.appendLine(`--- Workflow Finished Successfully ---`);
										vscode.window.showInformationMessage(`Workflow finished successfully: ${displayName}`);
										resolve();
									} else {
										automaOutputChannel.appendLine(`--- Workflow Failed ---`);
										vscode.window.showErrorMessage(`Workflow execution failed: ${displayName}`);
										reject(new Error("Workflow failed"));
									}
									return;
								}
							}
						} catch (e) {
							// Polling error (e.g. server restarting), ignore and keep trying
						}
						// Wait 1 second BEFORE sending the next request
						await new Promise(r => setTimeout(r, 1000));
					}
				};

				pollStatus();
			});

		} catch (err: any) {
			vscode.window.showErrorMessage(`Automa Daemon Error: ${err.message}`);
		}
	});
}
