import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";
import { toError } from "../utils/typeGuards";

function getWorkspaceRoot(): string | undefined {
	if (
		vscode.workspace.workspaceFolders &&
		vscode.workspace.workspaceFolders.length > 0
	) {
		return vscode.workspace.workspaceFolders[0].uri.fsPath;
	}
	return undefined;
}

export async function createWorkflowCommand() {
	const args = ["studio"];
	const workspaceRoot = getWorkspaceRoot();
	if (workspaceRoot) {
		args.push("--vault-path", workspaceRoot);
	}

	await TaskRunner.runAutomaCli(args, {
		id: "create-workflow",
		name: "Create Workflow",
		source: "Automa",
		startMessage: "Opening Automa Studio to create a workflow...",
		successMessage: "Automa Studio launched successfully.",
		errorMessage: "Failed to open Automa Studio.",
		statusBarText: "$(rocket) Automa Studio",
		useTelemetry: false,
	});
}

export async function createPackageCommand() {
	const args = ["studio", "--route", "/packages"];
	const workspaceRoot = getWorkspaceRoot();
	if (workspaceRoot) {
		args.push("--vault-path", workspaceRoot);
	}

	await TaskRunner.runAutomaCli(args, {
		id: "create-package",
		name: "Create Package",
		source: "Automa",
		startMessage: "Opening Automa Studio to create a package...",
		successMessage: "Automa Studio launched successfully.",
		errorMessage: "Failed to open Automa Studio.",
		statusBarText: "$(package) Automa Studio",
		useTelemetry: false,
	});
}

export async function createProfileCommand() {
	const profileName = await vscode.window.showInputBox({
		prompt: "Enter a name for the new Browser Profile",
		placeHolder: "e.g. profile-1",
		validateInput: (value) => {
			if (!value) return "Profile name cannot be empty";
			if (!/^[a-zA-Z0-9\-_]+$/.test(value))
				return "Profile name can only contain alphanumeric characters, hyphens, and underscores";
			return null;
		},
	});

	if (!profileName) return;

	const workspaceRoot = getWorkspaceRoot();
	if (!workspaceRoot) {
		vscode.window.showErrorMessage("No workspace folder is open.");
		return;
	}

	const profilesDirUri = vscode.Uri.joinPath(
		vscode.Uri.file(workspaceRoot),
		"profiles",
	);

	try {
		// Attempt to read directory stats, create if it doesn't exist
		try {
			await vscode.workspace.fs.stat(profilesDirUri);
		} catch {
			await vscode.workspace.fs.createDirectory(profilesDirUri);
		}

		const profileUri = vscode.Uri.joinPath(
			profilesDirUri,
			`${profileName}.profile.json`,
		);

		let exists = true;
		try {
			await vscode.workspace.fs.stat(profileUri);
		} catch {
			exists = false;
		}

		if (exists) {
			vscode.window.showErrorMessage(
				`Profile '${profileName}' already exists.`,
			);
			return;
		}

		const profileData = {
			name: profileName,
			userDataDir: `./profiles/${profileName}-data`,
			extensions: [],
		};

		const contentBuffer = new TextEncoder().encode(
			JSON.stringify(profileData, null, 2),
		);
		await vscode.workspace.fs.writeFile(profileUri, contentBuffer);

		await vscode.commands.executeCommand(
			"vscode.openWith",
			profileUri,
			"automa.bprofileEditor",
		);
		vscode.window.showInformationMessage(
			`Profile '${profileName}' created successfully.`,
		);
	} catch (error: unknown) {
		vscode.window.showErrorMessage(
			`Failed to create profile: ${toError(error).message}`,
		);
	}
}
