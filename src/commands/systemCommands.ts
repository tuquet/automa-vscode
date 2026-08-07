import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";
import { WelcomePanel } from "../panels/WelcomePanel";
import { toError } from "../utils/typeGuards";

export function welcomeCommand(context: vscode.ExtensionContext) {
	return () => {
		WelcomePanel.createOrShow(context.extensionUri);
	};
}

export function installBrowserCommand() {
	return () => {
		return vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Installing Automa Browser...",
				cancellable: false,
			},
			async (_progress) => {
				try {
					const result = await DaemonManager.getInstance().executeRawCliCommand(
						["install-browser"],
					);
					if (result.code !== 0) {
						throw new Error(
							`Command failed with exit code ${result.code}\n${result.stderr}`,
						);
					}
					vscode.window.showInformationMessage(
						"Browser installed successfully!",
					);
				} catch (err: unknown) {
					const e = toError(err);
					vscode.window.showErrorMessage(
						`Failed to install browser: ${e.message}`,
					);
					throw e;
				}
			},
		);
	};
}

export function toggleDaemonCommand() {
	return async () => {
		try {
			const daemon = DaemonManager.getInstance();
			if (daemon.isRunning()) {
				daemon.stop();
				vscode.window.showInformationMessage("Automa CLI Daemon stopped.");
			} else {
				vscode.window.showInformationMessage("Starting Automa CLI Daemon...");
				await daemon.start();
				if (daemon.isRunning()) {
					vscode.window.showInformationMessage(
						"Automa CLI Daemon started successfully.",
					);
				} else {
					vscode.window.showErrorMessage(
						"Failed to start Automa CLI Daemon. Check logs for details.",
					);
				}
			}
		} catch (error: unknown) {
			const e = toError(error);
			vscode.window.showErrorMessage(`Failed to toggle daemon: ${e.message}`);
		}
	};
}
