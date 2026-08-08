import { Logger } from "./Logger";

export class DaemonStreamParser {
	public static extractJSON(str: string): unknown {
		const trimmed = str.trim();
		if (!trimmed) throw new Error("Empty output");

		try {
			return JSON.parse(trimmed);
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.message : String(err);
			Logger.info(`[Daemon IPC] First parse attempt failed: ${errMsg}`);
		}

		// Fallback: Check the tail of the output for a single-line complete JSON without O(N) scanning
		const MAX_TAIL_LENGTH = 8192;
		const tailEnd = trimmed.substring(
			Math.max(0, trimmed.length - MAX_TAIL_LENGTH),
		);

		let currentEnd = tailEnd.length;
		for (let i = 0; i < 50; i++) {
			if (currentEnd <= 0) break;
			const prevNewline = tailEnd.lastIndexOf("\n", currentEnd - 1);
			const startIndex = prevNewline === -1 ? 0 : prevNewline + 1;
			const line = tailEnd.substring(startIndex, currentEnd).trim();

			if (line.startsWith("{") || line.startsWith("[")) {
				try {
					return JSON.parse(line);
				} catch (err: unknown) {
					const errMsg = err instanceof Error ? err.message : String(err);
					Logger.info(`[Daemon IPC] Line parse attempt failed: ${errMsg}`);
				}
			}

			if (prevNewline === -1) break;
			currentEnd = prevNewline;
		}

		// Find first { or [ and last } or ] within the bounded tail
		const firstCurly = tailEnd.indexOf("{");
		const firstSquare = tailEnd.indexOf("[");
		const firstIdx =
			firstCurly === -1
				? firstSquare
				: firstSquare === -1
					? firstCurly
					: Math.min(firstCurly, firstSquare);
		const isObject = firstIdx !== -1 && firstIdx === firstCurly;
		const lastIdx = isObject
			? tailEnd.lastIndexOf("}")
			: tailEnd.lastIndexOf("]");

		if (firstIdx !== -1 && lastIdx !== -1 && firstIdx < lastIdx) {
			const potentialJson = tailEnd.substring(firstIdx, lastIdx + 1);
			try {
				return JSON.parse(potentialJson);
			} catch (err: unknown) {
				const errMsg = err instanceof Error ? err.message : String(err);
				Logger.info(`[Daemon IPC] Substring parse attempt failed: ${errMsg}`);
			}
		}

		throw new Error("No valid JSON found in output");
	}

	public static parseOutput(output: string): unknown {
		try {
			return DaemonStreamParser.extractJSON(output);
		} catch (error: unknown) {
			const e =
				error instanceof Error ? error : new Error(String(error as unknown));
			throw new Error(
				`Failed to parse CLI JSON output: ${e.message}\nOutput was: ${output}`,
			);
		}
	}
}
