import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";
import { WelcomePanel } from "../panels/WelcomePanel";

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
					const errMsg = err instanceof Error ? err.message : String(err);
					vscode.window.showErrorMessage(
						`Failed to install browser: ${errMsg}`,
					);
					throw err;
				}
			},
		);
	};
}

export function toggleDaemonCommand() {
	return () => {
		const daemon = (DaemonManager as any).getInstance();
		if (daemon.daemonProcess) {
			daemon.stop();
		} else {
			daemon.start();
		}
	};
}
