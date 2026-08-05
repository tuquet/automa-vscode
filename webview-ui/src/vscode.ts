/**
 * A utility wrapper around the acquireVsCodeApi() function, which enables
 * message passing and state management between the webview and extension.
 */
class VSCodeAPIWrapper {
    private readonly vsCodeApi: any;

    constructor() {
        // @ts-ignore
        if (typeof acquireVsCodeApi === "function") {
            // @ts-ignore
            this.vsCodeApi = acquireVsCodeApi();
        }
    }

    public postMessage(message: any) {
        if (this.vsCodeApi) {
            this.vsCodeApi.postMessage(message);
        } else {
            console.log("postMessage:", message);
        }
    }
}

export const vscode = new VSCodeAPIWrapper();
