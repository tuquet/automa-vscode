import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as vscode from "vscode";

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

function isValidNanoId(id: any): boolean {
	if (!id || typeof id !== "string") return false;
	return /^[A-Za-z0-9_-]{21}$/.test(id);
}

export async function fixWorkflowIdCommand(
	nodeOrUri?: any,
	nodesOrUris?: any[],
) {
	// Support multi-selection
	let urisToProcess: vscode.Uri[] = [];

	if (nodesOrUris && Array.isArray(nodesOrUris) && nodesOrUris.length > 0) {
		urisToProcess = nodesOrUris.map((n) =>
			n.fsPath ? vscode.Uri.file(n.fsPath) : n,
		);
	} else if (nodeOrUri?.fsPath) {
		urisToProcess = [vscode.Uri.file(nodeOrUri.fsPath)];
	}

	if (urisToProcess.length === 0) {
		vscode.window.showErrorMessage("Vui lòng chọn ít nhất 1 file .json.");
		return;
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

	if (fixedCount > 0) {
		vscode.window.showInformationMessage(
			`[Automa Auto-Fix] Đã tạo ID mới cho ${fixedCount} file(s).`,
		);
	} else if (skippedCount > 0) {
		vscode.window.showInformationMessage(
			`[Automa Auto-Fix] ${skippedCount} file(s) đã có ID hợp lệ, không cần sửa.`,
		);
	} else if (errorCount > 0) {
		vscode.window.showErrorMessage(
			`[Automa Auto-Fix] Lỗi khi xử lý ${errorCount} file(s). Kiểm tra console.`,
		);
	}
}
