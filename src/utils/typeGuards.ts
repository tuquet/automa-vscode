import * as vscode from "vscode";

/**
 * Checks if a value is a non-null object (and not an array).
 * This is highly optimized for runtime performance.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
	return typeof value === "string";
}

export function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

export function isNumber(value: unknown): value is number {
	return typeof value === "number";
}

export function hasStringProp<K extends string>(
	value: unknown,
	key: K,
): value is Record<K, string> {
	return hasProp(value, key) && typeof value[key] === "string";
}

export function hasObjectProp<K extends string>(
	value: unknown,
	key: K,
): value is Record<K, Record<string, unknown>> {
	return hasProp(value, key) && isRecord(value[key]);
}

/**
 * Extracts the file system path from various VS Code node/uri representations.
 * Replaces bloaty inline type checking across commands.
 */
export function extractFsPath(nodeOrUri: unknown): string | null {
	if (nodeOrUri instanceof vscode.Uri) {
		return nodeOrUri.fsPath;
	}
	if (
		hasProp(nodeOrUri, "resourceUri") &&
		nodeOrUri.resourceUri instanceof vscode.Uri
	) {
		return nodeOrUri.resourceUri.fsPath;
	}
	if (hasStringProp(nodeOrUri, "fsPath")) {
		return nodeOrUri.fsPath;
	}
	if (hasStringProp(nodeOrUri, "fullPath")) {
		return nodeOrUri.fullPath;
	}
	return null;
}

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(String(error));
}

export function hasNodesAndEdges(value: unknown): value is {
	nodes: Record<string, unknown>[];
	edges: Record<string, unknown>[];
} {
	return (
		isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges)
	);
}

export function getProp<T = unknown>(
	value: unknown,
	key: string,
): T | undefined {
	return isRecord(value) ? (value[key] as T) : undefined;
}

export function hasProp<K extends string>(
	value: unknown,
	key: K,
): value is Record<K, unknown> {
	return isRecord(value) && key in value;
}

export function castRecord(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

export function castRecordArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}
