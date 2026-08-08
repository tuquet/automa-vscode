/**
 * A utility wrapper around the acquireVsCodeApi() function, which enables
 * message passing and state management between the webview and extension.
 */
import { type Ref, ref, toRaw, watch } from "vue";

class VSCodeAPIWrapper {
	private readonly vsCodeApi: unknown;
	private messageId = 0;
	private pendingMessages = new Map<
		number,
		{ resolve: (val: unknown) => void; reject: (err: unknown) => void }
	>();
	private listeners = new Set<(message: unknown) => void>();

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
					if (message.type === "error") {
						pending.reject(new Error(String(message.data)));
					} else {
						pending.resolve(message.data);
					}
					this.pendingMessages.delete(message.id);
				}
			} else {
				for (const listener of this.listeners) {
					listener(message);
				}
			}
		});
	}

	public onMessage(callback: (message: unknown) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	private safeClone(
		data: unknown,
		visited = new WeakMap<object, unknown>(),
	): unknown {
		if (data === undefined) return undefined;
		if (data === null) return null;

		const unwrap = (obj: unknown): unknown => {
			if (obj === null || typeof obj !== "object") return obj;

			const rawObj = toRaw(obj) as object;

			if (visited.has(rawObj)) return visited.get(rawObj);

			if (rawObj instanceof Date) return new Date(rawObj.getTime());
			if (rawObj instanceof RegExp)
				return new RegExp(rawObj.source, rawObj.flags);

			let cloned: unknown;
			if (rawObj instanceof Map) {
				cloned = new Map();
				visited.set(rawObj, cloned);
				for (const [key, value] of rawObj) {
					(cloned as Map<unknown, unknown>).set(unwrap(key), unwrap(value));
				}
				return cloned;
			}
			if (rawObj instanceof Set) {
				cloned = new Set();
				visited.set(rawObj, cloned);
				for (const value of rawObj) {
					(cloned as Set<unknown>).add(unwrap(value));
				}
				return cloned;
			}
			if (Array.isArray(rawObj)) {
				cloned = [] as unknown[];
				visited.set(rawObj, cloned);
				for (const item of rawObj) {
					(cloned as unknown[]).push(unwrap(item));
				}
				return cloned;
			}

			cloned = {} as Record<string, unknown>;
			visited.set(rawObj, cloned);
			for (const key in rawObj) {
				if (Object.hasOwn(rawObj, key)) {
					(cloned as Record<string, unknown>)[key] = unwrap(
						(rawObj as Record<string, unknown>)[key],
					);
				}
			}
			return cloned;
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

	/**
	 * Creates a Vue reactive state connected to VS Code's Webview state.
	 * Reactivity works mượt mà (smoothly) and auto-saves to VS Code on mutation.
	 */
	public useState<T>(initialState: T): Ref<T> {
		const savedState = this.getState() as T | undefined;

		const mergeDeep = (target: unknown, source: unknown): unknown => {
			if (target === null || typeof target !== "object")
				return source !== undefined ? source : target;
			if (source === null || typeof source !== "object") return source;
			if (Array.isArray(target) && Array.isArray(source)) return source;

			const result = { ...(target as Record<string, unknown>) };
			const sourceObj = source as Record<string, unknown>;

			for (const key in sourceObj) {
				if (Object.hasOwn(sourceObj, key)) {
					if (
						typeof sourceObj[key] === "object" &&
						sourceObj[key] !== null &&
						!Array.isArray(sourceObj[key]) &&
						typeof result[key] === "object" &&
						result[key] !== null &&
						!Array.isArray(result[key])
					) {
						result[key] = mergeDeep(result[key], sourceObj[key]);
					} else {
						result[key] = sourceObj[key];
					}
				}
			}
			return result;
		};

		const mergedState =
			savedState !== undefined
				? mergeDeep(initialState, savedState)
				: initialState;

		const stateRef = ref<T>(mergedState as T) as Ref<T>;

		let saveTimeout: ReturnType<typeof setTimeout> | null = null;

		watch(
			stateRef,
			(newState) => {
				if (saveTimeout !== null) {
					clearTimeout(saveTimeout);
				}
				saveTimeout = setTimeout(() => {
					this.setState(newState);
					saveTimeout = null;
				}, 250);
			},
			{ deep: true, immediate: true },
		);

		return stateRef;
	}
}

export const vscode = new VSCodeAPIWrapper();
