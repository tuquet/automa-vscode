import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let terminal: vscode.Terminal | null = null;

function getOrCreateTerminal(): vscode.Terminal {
    if (terminal === null) {
        terminal = vscode.window.createTerminal('Automa CLI');
        vscode.window.onDidCloseTerminal((t) => {
            if (t === terminal) {
                terminal = null;
            }
        });
    }
    terminal.show();
    return terminal;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Automa VS Code Extension is now active!');

    // Command: Open Studio
    let openStudioCmd = vscode.commands.registerCommand('automa.openStudio', () => {
        vscode.window.showInformationMessage('Launching Automa Studio in Terminal...');
        const t = getOrCreateTerminal();
        t.sendText('npx automa studio');
    });

    // Command: Run Workflow
    let runWorkflowCmd = vscode.commands.registerCommand('automa.runWorkflow', async (nodeOrUri?: any) => {
        let commandArgs = "";
        let displayName = "";

        if (nodeOrUri && nodeOrUri.fsPath) {
            // Local file triggered from VS Code Explorer or Editor
            commandArgs = `"${nodeOrUri.fsPath}"`;
            displayName = path.basename(nodeOrUri.fsPath);
        } else if (nodeOrUri && nodeOrUri.fullPath) {
            // Local file triggered from Automa TreeView
            commandArgs = `"${nodeOrUri.fullPath}"`;
            displayName = nodeOrUri.label;
        } else {
            // Manual input
            let input = await vscode.window.showInputBox({
                prompt: 'Enter absolute path to workflow JSON or Workflow ID (if cloud)',
                placeHolder: 'e.g. C:\\path\\to\\workflow.json or daily-checkin'
            });
            if (!input) return;
            
            if (input.endsWith('.json')) {
                commandArgs = `"${input}"`;
            } else {
                commandArgs = `--id "${input}"`;
            }
            displayName = input;
        }

        vscode.window.showInformationMessage(`Running workflow: ${displayName}`);
        const t = getOrCreateTerminal();
        t.sendText(`npx automa run ${commandArgs}`);
    });

    context.subscriptions.push(openStudioCmd, runWorkflowCmd);
}

export function deactivate() {}
