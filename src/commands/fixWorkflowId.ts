import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as vscode from "vscode";
import { extractFsPath, isString } from "../utils/typeGuards";

function generateShortId(): string {
	// Standard nanoid alphabet
	const chars =
		"useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
	let id = "";
	const bytes = crypto.randomBytes(21);
	for (let i = 0; i < 21; i++) {
		id += chars[bytes[i] & 63];
	}
	return id;
}

function isValidNanoId(id: unknown): boolean {
	if (!id || !isString(id)) return false;
	return /^[A-Za-z0-9_-]{21}$/.test(id);
}

export async function fixWorkflowIdCommand(
	nodeOrUri?: unknown,
	nodesOrUris?: unknown[],
) {
	// Support multi-selection
	let urisToProcess: vscode.Uri[] = [];

	if (nodesOrUris && Array.isArray(nodesOrUris) && nodesOrUris.length > 0) {
		urisToProcess = nodesOrUris
			.map((n) => {
				const path = extractFsPath(n);
				return path ? vscode.Uri.file(path) : null;
			})
			.filter((uri): uri is vscode.Uri => uri !== null);
	} else {
		const path = extractFsPath(nodeOrUri);
		if (path) {
			urisToProcess = [vscode.Uri.file(path)];
		} else if (vscode.window.activeTextEditor) {
			urisToProcess = [vscode.window.activeTextEditor.document.uri];
		}
	}

	if (urisToProcess.length === 0) {
		const uris = await vscode.window.showOpenDialog({
			canSelectMany: true,
			openLabel: "Select Workflow(s) to Fix",
			filters: {
				"JSON files": ["json"],
			},
		});
		if (!uris || uris.length === 0) return;
		urisToProcess.push(...uris);
	}

	let fixedCount = 0;
	let skippedCount = 0;
	let errorCount = 0;

	for (const uri of urisToProcess) {
		try {
			const targetPath = uri.fsPath;
			const content = fs.readFileSync(targetPath, "utf-8");
			const workflowData = JSON.parse(content);

			if (!isValidNanoId(workflowData.id)) {
				// Tạo ID chuẩn nanoid
				const newId = generateShortId();
				workflowData.id = newId;
				fs.writeFileSync(
					targetPath,
					JSON.stringify(workflowData, null, 4),
					"utf-8",
				);
				fixedCount++;
			} else {
				skippedCount++;
			}
		} catch (error: unknown) {
			const e = error instanceof Error ? error : new Error(String(error));
			errorCount++;
			console.error(`Error fixing ${uri.fsPath}: ${e.message}`);
		}
	}

	const messages: string[] = [];
	if (fixedCount > 0) messages.push(`Đã tạo ID mới cho ${fixedCount} file(s).`);
	if (skippedCount > 0) messages.push(`${skippedCount} file(s) đã hợp lệ.`);
	if (errorCount > 0)
		messages.push(`Lỗi khi xử lý ${errorCount} file(s). Kiểm tra console.`);

	if (messages.length > 0) {
		const fullMessage = `[Automa Auto-Fix] ${messages.join(" ")}`;
		if (errorCount > 0) {
			vscode.window.showWarningMessage(fullMessage);
		} else {
			vscode.window.showInformationMessage(fullMessage);
		}
	}
}
