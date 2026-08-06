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
		vscode.window.withProgress(
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
				} catch (err: any) {
					vscode.window.showErrorMessage(
						`Failed to install browser: ${err.message}`,
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
