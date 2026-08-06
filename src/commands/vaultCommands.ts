import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";

export interface ITable {
	id: string | number;
	name: string;
	columns: any[];
	items: any[];
	columnsIndex: Record<string, any>;
	createdAt?: number;
	modifiedAt?: number;
}

export async function addVariableCommand() {
	const key = await vscode.window.showInputBox({
		prompt: "Enter Variable Name",
	});
	if (!key) return;

	const value = await vscode.window.showInputBox({
		prompt: "Enter Variable Value",
	});
	if (value === undefined) return;

	if (
		!vscode.workspace.workspaceFolders ||
		vscode.workspace.workspaceFolders.length === 0
	) {
		vscode.window.showErrorMessage("No workspace open");
		return;
	}

	const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
	const globalsDir = path.join(workspaceRoot, "globals");
	if (!fs.existsSync(globalsDir)) {
		fs.mkdirSync(globalsDir, { recursive: true });
	}

	const varsPath = path.join(globalsDir, "variables.json");
	let variables: any[] = [];
	if (fs.existsSync(varsPath)) {
		try {
			const content = fs.readFileSync(varsPath, "utf8");
			const data = JSON.parse(content);
			if (Array.isArray(data)) {
				variables = data;
			} else if (typeof data === "object" && data !== null) {
				// If it's an object, convert to array for consistent internal handling, or keep as object
				// Usually Automa uses array of {name, value} or object.
				// Let's assume array of {name, value} is standard for global vault variables
				variables = Object.entries(data).map(([k, v]) => ({
					name: k,
					value: v,
				}));
			}
		} catch (_e) {
			vscode.window.showErrorMessage("Failed to read variables.json");
			return;
		}
	}

	const existingIndex = variables.findIndex(
		(v) => v.name === key || v.key === key,
	);
	if (existingIndex >= 0) {
		variables[existingIndex].value = value;
	} else {
		variables.push({ name: key, value: value });
	}

	fs.writeFileSync(varsPath, JSON.stringify(variables, null, 2), "utf8");
	vscode.window.showInformationMessage(`Variable ${key} added successfully.`);
}

export async function addCredentialCommand() {
	const name = await vscode.window.showInputBox({
		prompt: "Enter Credential Name",
	});
	if (!name) return;

	const secret = await vscode.window.showInputBox({
		prompt: "Enter Secret Value",
		password: true,
	});
	if (!secret) return;

	const config = vscode.workspace.getConfiguration("automa");
	let passphrase = config.get<string>("encryptionPassphrase");

	if (!passphrase) {
		passphrase = await vscode.window.showInputBox({
			prompt: "Enter Encryption Passphrase",
			password: true,
		});
		if (!passphrase) {
			vscode.window.showErrorMessage(
				"Passphrase is required to encrypt the credential.",
			);
			return;
		}
		// Save it to settings so we don't have to prompt again
		await config.update(
			"encryptionPassphrase",
			passphrase,
			vscode.ConfigurationTarget.Global,
		);
	}

	if (
		!vscode.workspace.workspaceFolders ||
		vscode.workspace.workspaceFolders.length === 0
	) {
		vscode.window.showErrorMessage("No workspace open");
		return;
	}

	const vaultPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Encrypting credential '${name}'...`,
			cancellable: false,
		},
		async () => {
			try {
				await DaemonManager.getInstance().executeRawCliCommand([
					"encrypt-secret",
					secret,
					"--name",
					name,
					"--passphrase",
					passphrase,
					"-v",
					vaultPath,
				]);
				vscode.window.showInformationMessage(
					`Credential ${name} encrypted and added successfully.`,
				);
			} catch (e: any) {
				vscode.window.showErrorMessage(
					`Failed to add credential: ${e.message}`,
				);
			}
		},
	);
}

export async function addTableCommand() {
	const name = await vscode.window.showInputBox({
		prompt: "Enter Table Name",
	});
	if (!name) return;

	if (
		!vscode.workspace.workspaceFolders ||
		vscode.workspace.workspaceFolders.length === 0
	) {
		vscode.window.showErrorMessage("No workspace open");
		return;
	}

	const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
	const globalsDir = path.join(workspaceRoot, "globals");
	if (!fs.existsSync(globalsDir)) {
		fs.mkdirSync(globalsDir, { recursive: true });
	}

	const tablesPath = path.join(globalsDir, "tables.json");
	let tables: ITable[] = [];
	if (fs.existsSync(tablesPath)) {
		try {
			const content = fs.readFileSync(tablesPath, "utf8");
			const data = JSON.parse(content);
			if (Array.isArray(data)) {
				tables = data;
			}
		} catch (_e) {
			vscode.window.showErrorMessage("Failed to read tables.json");
			return;
		}
	}

	const newTableId = `table_${Date.now().toString(36)}`;
	tables.push({
		id: newTableId,
		name: name,
		columns: [],
		items: [],
		columnsIndex: {},
		createdAt: Date.now(),
		modifiedAt: Date.now(),
	});

	fs.writeFileSync(tablesPath, JSON.stringify(tables, null, 2), "utf8");
	vscode.window.showInformationMessage(`Table ${name} added successfully.`);
}

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
			} catch (err: any) {
				vscode.window.showErrorMessage(`Encryption failed: ${err.message}`);
				throw err;
			}
		},
	);
}
