/**
 * A utility wrapper around the acquireVsCodeApi() function, which enables
 * message passing and state management between the webview and extension.
 */
import { toRaw } from "vue";

class VSCodeAPIWrapper {
	private readonly vsCodeApi: unknown;
	private messageId = 0;
	private pendingMessages = new Map<
		number,
		{ resolve: (val: unknown) => void; reject: (err: unknown) => void }
	>();

	constructor() {
		// @ts-expect-error
		if (typeof acquireVsCodeApi === "function") {
			// @ts-expect-error
			this.vsCodeApi = acquireVsCodeApi();
		}

		window.addEventListener("message", (event: MessageEvent) => {
			const message = event.data as {
				type?: string;
				id?: number;
				data?: unknown;
			};
			if (
				message &&
				typeof message.id === "number" &&
				this.pendingMessages.has(message.id)
			) {
				const pending = this.pendingMessages.get(message.id);
				if (pending) {
					if (message.type?.endsWith("-response")) {
						pending.resolve(message.data);
					} else if (message.type === "error") {
						pending.reject(new Error(String(message.data)));
					}
					this.pendingMessages.delete(message.id);
				}
			}
		});
	}

	private safeClone(data: unknown): unknown {
		if (data === undefined) return undefined;
		if (data === null) return null;

		const unwrap = (obj: unknown): unknown => {
			if (obj === null || typeof obj !== "object") return obj;
			if (obj instanceof Date) return new Date(obj.getTime());
			if (obj instanceof RegExp) return new RegExp(obj);
			if (obj instanceof Map) {
				const map = new Map();
				for (const [key, value] of obj) {
					map.set(unwrap(key), unwrap(value));
				}
				return map;
			}
			if (obj instanceof Set) {
				const set = new Set();
				for (const value of obj) {
					set.add(unwrap(value));
				}
				return set;
			}
			const raw = toRaw(obj);
			if (Array.isArray(raw)) {
				return raw.map((item) => unwrap(item));
			}
			const result = {} as Record<string, unknown>;
			for (const key in raw) {
				if (Object.hasOwn(raw, key)) {
					result[key] = unwrap((raw as Record<string, unknown>)[key]);
				}
			}
			return result;
		};

		try {
			return unwrap(data);
		} catch {
			return toRaw(data);
		}
	}

	public postMessage(message: unknown) {
		if (this.vsCodeApi) {
			const safeMessage = this.safeClone(message);
			(this.vsCodeApi as { postMessage: (msg: unknown) => void }).postMessage(
				safeMessage,
			);
		} else {
			console.log("postMessage:", message);
		}
	}

	public postMessageAsync(
		type: string,
		data?: unknown,
		keys?: unknown,
		timeoutMs = 30000,
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const id = ++this.messageId;

			const timeout = setTimeout(() => {
				if (this.pendingMessages.has(id)) {
					this.pendingMessages.delete(id);
					reject(new Error(`Message timeout for type ${type}`));
				}
			}, timeoutMs);

			const resolveWrapper = (val: unknown) => {
				clearTimeout(timeout);
				resolve(val);
			};

			const rejectWrapper = (err: unknown) => {
				clearTimeout(timeout);
				reject(err);
			};

			this.pendingMessages.set(id, {
				resolve: resolveWrapper,
				reject: rejectWrapper,
			});
			this.postMessage({ type, id, data, keys });
		});
	}

	public getState(): unknown {
		if (this.vsCodeApi) {
			return (this.vsCodeApi as { getState: () => unknown }).getState();
		}
		return undefined;
	}

	public setState(newState: unknown) {
		if (this.vsCodeApi) {
			const safeState = this.safeClone(newState);
			(this.vsCodeApi as { setState: (state: unknown) => void }).setState(
				safeState,
			);
		}
	}
}

export const vscode = new VSCodeAPIWrapper();
