import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { DaemonManager } from "../core/DaemonManager";
import { isRecord, toError } from "../utils/typeGuards";

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
	} catch (_e: unknown) {
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
	} else if (isRecord(data)) {
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
	} else if (isRecord(data)) {
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
				const e = toError(error);
				vscode.window.showErrorMessage(
					`Failed to add credential: ${e.message}`,
				);
				throw e;
			}
		},
	);
}

export async function deleteVaultItemCommand(
	item?: import("../providers/VaultTreeDataProvider").VaultItem,
) {
	let targetItem = item;

	if (!targetItem?.resourceUri || !targetItem.label) {
		const items: (vscode.QuickPickItem & {
			payload: import("../providers/VaultTreeDataProvider").VaultItem;
		})[] = [];
		const workspaceRoot = getWorkspaceRoot();
		if (!workspaceRoot) return;

		const patterns = [
			{ pattern: "**/*.variable.json", type: "Variable" as const },
			{ pattern: "**/*.credential.json", type: "Credential" as const },
			{ pattern: "**/*.table.json", type: "Table" as const },
		];

		for (const p of patterns) {
			const files = await vscode.workspace.findFiles(
				p.pattern,
				"**/node_modules/**",
			);
			for (const file of files) {
				const { data, success } = readVaultFileSafely(file.fsPath);
				if (!success) continue;
				if (Array.isArray(data)) {
					for (const entry of data) {
						const label = String(
							entry.name || entry.id || entry.key || "Unnamed",
						);
						const itemId = String(entry.id || entry.key || entry.name);
						items.push({
							label: `$(symbol-field) ${label}`,
							description: p.type,
							detail: file.fsPath,
							payload: {
								label,
								type: p.type,
								resourceUri: file,
								itemId,
								collapsibleState: vscode.TreeItemCollapsibleState.None,
							},
						});
					}
				} else if (isRecord(data) && p.type !== "Table") {
					for (const [key] of Object.entries(data)) {
						items.push({
							label: `$(symbol-field) ${key}`,
							description: p.type,
							detail: file.fsPath,
							payload: {
								label: key,
								type: p.type,
								resourceUri: file,
								itemId: key,
								collapsibleState: vscode.TreeItemCollapsibleState.None,
							},
						});
					}
				}
			}
		}

		if (items.length === 0) {
			vscode.window.showInformationMessage("No vault items found to delete.");
			return;
		}

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: "Select a Vault Item to delete",
			matchOnDescription: true,
			matchOnDetail: true,
		});

		if (!selected) return;
		targetItem = selected.payload;
	}

	if (!targetItem?.resourceUri || !targetItem.label) return;

	const confirm = await vscode.window.showWarningMessage(
		`Are you sure you want to delete ${targetItem.type.toLowerCase()} '${targetItem.label}'?`,
		"Yes",
		"No",
	);
	if (confirm !== "Yes") return;

	try {
		const content = fs.readFileSync(targetItem.resourceUri.fsPath, "utf8");
		let data = JSON.parse(content);
		let modified = false;

		if (Array.isArray(data)) {
			const initialLength = data.length;
			data = data.filter((entry: Record<string, unknown>) => {
				if (targetItem?.itemId) {
					const entryId = entry.id || entry.key || entry.name;
					return entryId !== targetItem?.itemId;
				}
				const name = entry.name || entry.id || entry.key;
				return name !== targetItem?.label;
			});
			modified = data.length !== initialLength;
		} else if (isRecord(data)) {
			const keyToDelete = targetItem.itemId || targetItem.label;
			if (keyToDelete in data) {
				delete (data as Record<string, unknown>)[keyToDelete];
				modified = true;
			}
		}

		if (modified) {
			writeJsonFile(targetItem.resourceUri.fsPath, data);
			vscode.window.showInformationMessage(
				`${targetItem.type} '${targetItem.label}' deleted.`,
			);
		}
	} catch (error: unknown) {
		const e = toError(error);
		vscode.window.showErrorMessage(
			`Failed to delete ${targetItem.type.toLowerCase()}: ${e.message}`,
		);
	}
}
