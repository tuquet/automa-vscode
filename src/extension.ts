import * as vscode from "vscode";
import { ExtensionApp } from "./core/ExtensionApp";

export function activate(context: vscode.ExtensionContext) {
	ExtensionApp.getInstance().activate(context);
}

export function deactivate() {
	ExtensionApp.getInstance().deactivate();
}
