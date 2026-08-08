/**
 * A utility wrapper around the acquireVsCodeApi() function, which enables
 * message passing and state management between the webview and extension.
 */
import { type Ref, ref, watch } from "vue";
import { cloneDeep, merge } from "lodash-es";
import mitt from "mitt";

class VSCodeAPIWrapper {
	private readonly vsCodeApi: unknown;
	private messageId = 0;
	private emitter = mitt();
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
			if (message && typeof message.id === "number") {
				if (message.type === "error") {
					this.emitter.emit(`error:${message.id}`, new Error(String(message.data)));
				} else {
					this.emitter.emit(`response:${message.id}`, message.data);
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

	private safeClone(data: unknown): unknown {
		return cloneDeep(data);
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

			const onResponse = (val: unknown) => {
				clearTimeout(timeout);
				this.emitter.off(`error:${id}`, onError);
				resolve(val);
			};

			const onError = (err: unknown) => {
				clearTimeout(timeout);
				this.emitter.off(`response:${id}`, onResponse);
				reject(err);
			};

			const timeout = setTimeout(() => {
				this.emitter.off(`response:${id}`, onResponse);
				this.emitter.off(`error:${id}`, onError);
				reject(new Error(`Message timeout for type ${type}`));
			}, timeoutMs);

			this.emitter.on(`response:${id}`, onResponse);
			this.emitter.on(`error:${id}`, onError);

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

		const mergedState =
			savedState !== undefined
				? merge(cloneDeep(initialState), savedState)
				: cloneDeep(initialState);

		const stateRef = ref<T>(mergedState as T) as Ref<T>;

		let saveTimeout: ReturnType<typeof setTimeout> | null = null;

		watch(
			stateRef,
			(newState) => {
				const clonedState = cloneDeep(newState);
				if (saveTimeout !== null) {
					clearTimeout(saveTimeout);
				}
				saveTimeout = setTimeout(() => {
					this.setState(clonedState);
					saveTimeout = null;
				}, 250);
			},
			{ deep: true, immediate: true },
		);

		return stateRef;
	}
}

export const vscode = new VSCodeAPIWrapper();
