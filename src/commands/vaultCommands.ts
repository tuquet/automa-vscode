import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";

export interface ITable {
	id: string | number;
	name: string;
	columns: Record<string, unknown>[];
	items: Record<string, unknown>[];
	columnsIndex: Record<string, string>;
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

function loadVariables(
	varsPath: string,
): Array<{ name?: string; key?: string; value: unknown }> {
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
		vscode.window.showErrorMessage(`Failed to read ${path.basename(varsPath)}`);
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
		vscode.window.showErrorMessage(
			`Failed to read ${path.basename(tablesPath)}`,
		);
	}
	return [];
}

function writeJsonFile(filePath: string, data: unknown): void {
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

	const varsPath = getGlobalsFilePath("globals.variable.json");
	if (!varsPath) return;

	let data: any = [];
	if (fs.existsSync(varsPath)) {
		try {
			const content = fs.readFileSync(varsPath, "utf8");
			data = JSON.parse(content);
		} catch (_e) {
			vscode.window.showErrorMessage(`Failed to read globals.variable.json`);
			return;
		}
	}

	if (Array.isArray(data)) {
		const existingIndex = data.findIndex(
			(v: any) => v.name === key || v.key === key,
		);
		if (existingIndex >= 0) {
			data[existingIndex].value = value;
		} else {
			data.push({ name: key, value: value });
		}
	} else if (typeof data === "object" && data !== null) {
		data[key] = value;
	} else {
		data = [{ name: key, value: value }];
	}

	writeJsonFile(varsPath, data);
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

	const tablesPath = getGlobalsFilePath("globals.table.json");
	if (!tablesPath) return;

	let data: any = [];
	if (fs.existsSync(tablesPath)) {
		try {
			const content = fs.readFileSync(tablesPath, "utf8");
			data = JSON.parse(content);
		} catch (_e) {
			vscode.window.showErrorMessage(`Failed to read globals.table.json`);
			return;
		}
	}

	const newTableId = `table_${Date.now().toString(36)}`;
	const newTable = {
		id: newTableId,
		name: name,
		columns: [],
		items: [],
		columnsIndex: {},
		createdAt: Date.now(),
		modifiedAt: Date.now(),
	};

	if (Array.isArray(data)) {
		data.push(newTable);
	} else if (typeof data === "object" && data !== null) {
		data[newTableId] = newTable;
	} else {
		data = [newTable];
	}

	writeJsonFile(tablesPath, data);
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

export async function deleteVaultItemCommand(
	item: import("../providers/VaultTreeDataProvider").VaultItem,
) {
	if (!item?.resourceUri || !item.label) return;

	const confirm = await vscode.window.showWarningMessage(
		`Are you sure you want to delete ${item.type.toLowerCase()} '${item.label}'?`,
		"Yes",
		"No",
	);
	if (confirm !== "Yes") return;

	try {
		const content = fs.readFileSync(item.resourceUri.fsPath, "utf8");
		let data = JSON.parse(content);
		let modified = false;

		if (Array.isArray(data)) {
			const initialLength = data.length;
			data = data.filter((entry: Record<string, unknown>) => {
				if (item.itemId) {
					const entryId = entry.id || entry.key || entry.name;
					return entryId !== item.itemId;
				}
				const name = entry.name || entry.id || entry.key;
				return name !== item.label;
			});
			modified = data.length !== initialLength;
		} else if (typeof data === "object" && data !== null) {
			const keyToDelete = item.itemId || item.label;
			if (keyToDelete in data) {
				delete (data as Record<string, unknown>)[keyToDelete];
				modified = true;
			}
		}

		if (modified) {
			writeJsonFile(item.resourceUri.fsPath, data);
			vscode.window.showInformationMessage(
				`${item.type} '${item.label}' deleted.`,
			);
		}
	} catch (error: unknown) {
		const e = error instanceof Error ? error : new Error(String(error));
		vscode.window.showErrorMessage(
			`Failed to delete ${item.type.toLowerCase()}: ${e.message}`,
		);
	}
}
