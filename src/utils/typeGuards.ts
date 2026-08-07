import * as vscode from "vscode";

/**
 * Checks if a value is a non-null object (and not an array).
 * This is highly optimized for runtime performance.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks if an object has a string `fsPath` property.
 */
export function hasFsPath(value: unknown): value is { fsPath: string } {
	return isRecord(value) && typeof value.fsPath === "string";
}

/**
 * Checks if an object has a `resourceUri` property that is a `vscode.Uri`.
 */
export function hasResourceUri(
	value: unknown,
): value is { resourceUri: vscode.Uri } {
	return isRecord(value) && value.resourceUri instanceof vscode.Uri;
}

/**
 * Checks if an object has a string `fullPath` property.
 */
export function hasFullPath(value: unknown): value is { fullPath: string } {
	return isRecord(value) && typeof value.fullPath === "string";
}

/**
 * Extracts the file system path from various VS Code node/uri representations.
 * Replaces bloaty inline type checking across commands.
 */
export function extractFsPath(nodeOrUri: unknown): string | null {
	if (nodeOrUri instanceof vscode.Uri) {
		return nodeOrUri.fsPath;
	}
	if (hasResourceUri(nodeOrUri)) {
		return nodeOrUri.resourceUri.fsPath;
	}
	if (hasFsPath(nodeOrUri)) {
		return nodeOrUri.fsPath;
	}
	if (hasFullPath(nodeOrUri)) {
		return nodeOrUri.fullPath;
	}
	return null;
}
