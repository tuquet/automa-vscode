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

function readVaultFileSafely(filePath: string): {
	data: Record<string, unknown>[] | Record<string, unknown>;
	success: boolean;
} {
	if (!fs.existsSync(filePath)) return { data: [], success: true };
	try {
		const content = fs.readFileSync(filePath, "utf8");
		return { data: JSON.parse(content), success: true };
	} catch (_e) {
		vscode.window.showErrorMessage(`Failed to read ${path.basename(filePath)}`);
		return { data: [], success: false };
	}
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

	const { data: rawData, success } = readVaultFileSafely(varsPath);
	if (!success) return;

	let data = rawData;

	if (Array.isArray(data)) {
		const existingIndex = data.findIndex(
			(v: Record<string, unknown>) => v.name === key || v.key === key,
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

	const { data: rawData, success } = readVaultFileSafely(tablesPath);
	if (!success) return;

	let data = rawData;

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
