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

// --- Helper Functions for Vault Storage (SRP) ---
function getWorkspaceRoot(): string | undefined {
	if (
		!vscode.workspace.workspaceFolders ||
		vscode.workspace.workspaceFolders.length === 0
	) {
		vscode.window.showErrorMessage("No workspace open");
		return undefined;
	}
	return vscode.workspace.workspaceFolders[0].uri.fsPath;
}

function getGlobalsFilePath(filename: string): string | undefined {
	const workspaceRoot = getWorkspaceRoot();
	if (!workspaceRoot) return undefined;

	const globalsDir = path.join(workspaceRoot, "globals");
	if (!fs.existsSync(globalsDir)) {
		fs.mkdirSync(globalsDir, { recursive: true });
	}

	return path.join(globalsDir, filename);
}

function loadVariables(varsPath: string): any[] {
	if (!fs.existsSync(varsPath)) return [];
	try {
		const content = fs.readFileSync(varsPath, "utf8");
		const data = JSON.parse(content);
		if (Array.isArray(data)) {
			return data;
		}
		if (typeof data === "object" && data !== null) {
			return Object.entries(data).map(([k, v]) => ({
				name: k,
				value: v,
			}));
		}
	} catch (_e) {
		vscode.window.showErrorMessage("Failed to read variables.json");
	}
	return [];
}

function loadTables(tablesPath: string): ITable[] {
	if (!fs.existsSync(tablesPath)) return [];
	try {
		const content = fs.readFileSync(tablesPath, "utf8");
		const data = JSON.parse(content);
		if (Array.isArray(data)) {
			return data;
		}
	} catch (_e) {
		vscode.window.showErrorMessage("Failed to read tables.json");
	}
	return [];
}

function writeJsonFile(filePath: string, data: any): void {
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}
// ------------------------------------------------

export async function addVariableCommand() {
	const key = await vscode.window.showInputBox({
		prompt: "Enter Variable Name",
	});
	if (!key) return;

	const value = await vscode.window.showInputBox({
		prompt: "Enter Variable Value",
	});
	if (value === undefined) return;

	const varsPath = getGlobalsFilePath("variables.json");
	if (!varsPath) return;

	const variables = loadVariables(varsPath);

	const existingIndex = variables.findIndex(
		(v) => v.name === key || v.key === key,
	);
	if (existingIndex >= 0) {
		variables[existingIndex].value = value;
	} else {
		variables.push({ name: key, value: value });
	}

	writeJsonFile(varsPath, variables);
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
		await config.update(
			"encryptionPassphrase",
			passphrase,
			vscode.ConfigurationTarget.Global,
		);
	}

	await executeEncryption(name, secret, passphrase);
}

export async function addTableCommand() {
	const name = await vscode.window.showInputBox({
		prompt: "Enter Table Name",
	});
	if (!name) return;

	const tablesPath = getGlobalsFilePath("tables.json");
	if (!tablesPath) return;

	const tables = loadTables(tablesPath);

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

	writeJsonFile(tablesPath, tables);
	vscode.window.showInformationMessage(`Table ${name} added successfully.`);
}

export async function encryptSecretCommand() {
	await addCredentialCommand();
}

async function executeEncryption(
	name: string,
	secret: string,
	passphrase?: string,
) {
	const vaultPath = getWorkspaceRoot();
	if (!vaultPath) return;

	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Encrypting credential '${name}'...`,
			cancellable: false,
		},
		async () => {
			try {
				const args = [
					"encrypt-secret",
					secret,
					"--name",
					name,
					"-v",
					vaultPath,
				];
				if (passphrase) {
					args.push("-p", passphrase);
				}
				await DaemonManager.getInstance().executeRawCliCommand(args);
				vscode.window.showInformationMessage(
					`Credential ${name} encrypted and added successfully.`,
				);
			} catch (error: unknown) {
				const e = error instanceof Error ? error : new Error(String(error));
				vscode.window.showErrorMessage(
					`Failed to add credential: ${e.message}`,
				);
				throw e;
			}
		},
	);
}
