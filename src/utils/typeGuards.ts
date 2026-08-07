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

export function isFunction(
	value: unknown,
): value is (...args: unknown[]) => unknown {
	return typeof value === "function";
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
export function extractUri(nodeOrUri: unknown): vscode.Uri | null {
	if (nodeOrUri instanceof vscode.Uri) {
		return nodeOrUri;
	}
	if (
		hasProp(nodeOrUri, "resourceUri") &&
		nodeOrUri.resourceUri instanceof vscode.Uri
	) {
		return nodeOrUri.resourceUri;
	}
	if (hasStringProp(nodeOrUri, "fsPath")) {
		return vscode.Uri.file(nodeOrUri.fsPath);
	}
	if (hasStringProp(nodeOrUri, "fullPath")) {
		return vscode.Uri.file(nodeOrUri.fullPath);
	}
	return null;
}

export function extractFsPath(nodeOrUri: unknown): string | null {
	const uri = extractUri(nodeOrUri);
	return uri ? uri.fsPath : null;
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
	return hasArrayProp(value, "nodes") && hasArrayProp(value, "edges");
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

export function hasArrayProp<K extends string>(
	value: unknown,
	key: K,
): value is Record<K, unknown[]> {
	return hasProp(value, key) && Array.isArray(value[key]);
}

export function assertIsRecord(
	value: unknown,
	message?: string,
): asserts value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(message || "Value is not a record");
	}
}

export function assertHasProp<K extends string>(
	value: unknown,
	key: K,
	message?: string,
): asserts value is Record<K, unknown> {
	assertIsRecord(value, message);
	if (!(key in value)) {
		throw new Error(message || `Missing property ${key}`);
	}
}
