/**
 * A utility wrapper around the acquireVsCodeApi() function, which enables
 * message passing and state management between the webview and extension.
 */
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
					}
					this.pendingMessages.delete(message.id);
				}
			}
		});
	}

	public postMessage(message: unknown) {
		if (this.vsCodeApi) {
			(this.vsCodeApi as { postMessage: (msg: unknown) => void }).postMessage(
				message,
			);
		} else {
			console.log("postMessage:", message);
		}
	}

	public postMessageAsync(
		type: string,
		data?: unknown,
		keys?: unknown,
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const id = ++this.messageId;
			this.pendingMessages.set(id, { resolve, reject });
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
			(this.vsCodeApi as { setState: (state: unknown) => void }).setState(
				newState,
			);
		}
	}
}

export const vscode = new VSCodeAPIWrapper();
