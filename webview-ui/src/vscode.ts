/**
 * A utility wrapper around the acquireVsCodeApi() function, which enables
 * message passing and state management between the webview and extension.
 */
class VSCodeAPIWrapper {
	private readonly vsCodeApi: unknown;

	constructor() {
		// @ts-expect-error
		if (typeof acquireVsCodeApi === "function") {
			// @ts-expect-error
			this.vsCodeApi = acquireVsCodeApi();
		}
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
}

export const vscode = new VSCodeAPIWrapper();
