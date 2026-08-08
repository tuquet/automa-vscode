/**
 * A utility wrapper around the acquireVsCodeApi() function, which enables
 * message passing and state management between the webview and extension.
 */
import { type Ref, ref, watch, toRaw } from "vue";
import { cloneDeep, merge, debounce } from "lodash-es";
import mitt from "mitt";
import pTimeout from "p-timeout";

class VSCodeAPIWrapper {
	private readonly vsCodeApi: unknown;
	private messageId = 0;
	private emitter = mitt();

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
				this.emitter.emit("broadcast", message);
			}
		});
	}

	public onMessage(callback: (message: unknown) => void): () => void {
		this.emitter.on("broadcast", callback);
		return () => this.emitter.off("broadcast", callback);
	}

	public postMessage(message: unknown) {
		if (this.vsCodeApi) {
			const safeMessage = cloneDeep(message);
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
		const id = ++this.messageId;

		const promise = new Promise((resolve, reject) => {
			const onResponse = (val: unknown) => resolve(val);
			const onError = (err: unknown) => reject(err);

			this.emitter.on(`response:${id}`, onResponse);
			this.emitter.on(`error:${id}`, onError);

			this.postMessage({ type, id, data, keys });
		});

		return pTimeout(promise, { milliseconds: timeoutMs, message: `Message timeout for type ${type}` })
			.finally(() => {
				this.emitter.off(`response:${id}`);
				this.emitter.off(`error:${id}`);
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
			const safeState = cloneDeep(newState);
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

		const saveDebounced = debounce((stateToSave: T) => {
			this.setState(cloneDeep(toRaw(stateToSave)));
		}, 250);

		watch(
			stateRef,
			(newState) => {
				saveDebounced(newState);
			},
			{ deep: true, immediate: true },
		);

		return stateRef;
	}
}

export const vscode = new VSCodeAPIWrapper();
