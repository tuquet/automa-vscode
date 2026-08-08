export async function encryptSecretCommand() {
	const secretName = await vscode.window.showInputBox({
		prompt: "Enter the name for this credential",
		placeHolder: "e.g. GithubToken",
	});
	if (!secretName) return;

	const plaintext = await vscode.window.showInputBox({
		prompt: `Enter the secret value for '${secretName}'`,
		password: true,
	});
	if (!plaintext) return;

	const passphrase = await vscode.window.showInputBox({
		prompt:
			"Enter your Automa Passphrase (or leave empty to use AUTOMA_PASSPHRASE env)",
		password: true,
	});

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showErrorMessage("No workspace open.");
		return;
	}
	const vaultPath = workspaceFolders[0].uri.fsPath;

	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Encrypting secret '${secretName}'...`,
			cancellable: false,
		},
		async () => {
			try {
				const args = [
					"encrypt-secret",
					plaintext,
					"--name",
					secretName,
					"-v",
					vaultPath,
				];
				if (passphrase) {
					args.push("-p", passphrase);
				}
				await DaemonManager.getInstance().executeRawCliCommand(args);
				vscode.window.showInformationMessage(
					`Secret '${secretName}' encrypted and saved!`,
				);
			} catch (err: unknown) {
				const errMsg = err instanceof Error ? err.message : String(err);
				vscode.window.showErrorMessage(`Encryption failed: ${errMsg}`);
				throw err;
			}
		},
	);
}
