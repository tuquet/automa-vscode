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
					await DaemonManager.getInstance().executeRawCliCommand([
						"install-browser",
					]);
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
		const daemon = DaemonManager.getInstance();
		if (daemon.isRunning()) {
			daemon.stop();
		} else {
			await daemon.start();
		}
	};
}
