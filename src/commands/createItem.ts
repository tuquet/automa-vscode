import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { TaskRunner } from "../core/TaskRunner";

export async function createWorkflowCommand() {
	await TaskRunner.runAutomaCli(["studio"], {
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
	await TaskRunner.runAutomaCli(["studio", "--route", "/packages"], {
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

	if (
		!vscode.workspace.workspaceFolders ||
		vscode.workspace.workspaceFolders.length === 0
	) {
		vscode.window.showErrorMessage("No workspace folder is open.");
		return;
	}

	const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
	const profilesDir = path.join(workspaceRoot, "profiles");

	if (!fs.existsSync(profilesDir)) {
		fs.mkdirSync(profilesDir, { recursive: true });
	}

	const profilePath = path.join(profilesDir, `${profileName}.profile.json`);

	if (fs.existsSync(profilePath)) {
		vscode.window.showErrorMessage(`Profile '${profileName}' already exists.`);
		return;
	}

	const profileData = {
		name: profileName,
		userDataDir: `./profiles/${profileName}-data`,
		extensions: [],
	};

	fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2), "utf8");

	const doc = await vscode.workspace.openTextDocument(profilePath);
	await vscode.window.showTextDocument(doc);
	vscode.window.showInformationMessage(
		`Profile '${profileName}' created successfully.`,
	);
}
