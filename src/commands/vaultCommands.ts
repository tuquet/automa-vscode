import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DaemonManager } from '../core/DaemonManager';

export async function addVariableCommand() {
    const key = await vscode.window.showInputBox({ prompt: 'Enter Variable Name' });
    if (!key) return;

    const value = await vscode.window.showInputBox({ prompt: 'Enter Variable Value' });
    if (value === undefined) return;

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace open');
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const globalsDir = path.join(workspaceRoot, 'globals');
    if (!fs.existsSync(globalsDir)) {
        fs.mkdirSync(globalsDir, { recursive: true });
    }

    const varsPath = path.join(globalsDir, 'variables.json');
    let variables: any[] = [];
    if (fs.existsSync(varsPath)) {
        try {
            const content = fs.readFileSync(varsPath, 'utf8');
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
                variables = data;
            } else if (typeof data === 'object' && data !== null) {
                // If it's an object, convert to array for consistent internal handling, or keep as object
                // Usually Automa uses array of {name, value} or object.
                // Let's assume array of {name, value} is standard for global vault variables
                variables = Object.entries(data).map(([k, v]) => ({ name: k, value: v }));
            }
        } catch (e) {
            vscode.window.showErrorMessage('Failed to read variables.json');
            return;
        }
    }

    const existingIndex = variables.findIndex(v => (v.name === key || v.key === key));
    if (existingIndex >= 0) {
        variables[existingIndex].value = value;
    } else {
        variables.push({ name: key, value: value });
    }

    fs.writeFileSync(varsPath, JSON.stringify(variables, null, 2), 'utf8');
    vscode.window.showInformationMessage(`Variable ${key} added successfully.`);
}

export async function addCredentialCommand() {
    const name = await vscode.window.showInputBox({ prompt: 'Enter Credential Name' });
    if (!name) return;

    const secret = await vscode.window.showInputBox({ prompt: 'Enter Secret Value', password: true });
    if (!secret) return;

    const config = vscode.workspace.getConfiguration('automa');
    let passphrase = config.get<string>('encryptionPassphrase');

    if (!passphrase) {
        passphrase = await vscode.window.showInputBox({ prompt: 'Enter Encryption Passphrase', password: true });
        if (!passphrase) {
            vscode.window.showErrorMessage('Passphrase is required to encrypt the credential.');
            return;
        }
        // Save it to settings so we don't have to prompt again
        await config.update('encryptionPassphrase', passphrase, vscode.ConfigurationTarget.Global);
    }

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace open');
        return;
    }

    const vaultPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Encrypting credential '${name}'...`,
        cancellable: false
    }, async () => {
        try {
            await DaemonManager.getInstance().executeRawCliCommand(['encrypt-secret', secret, '--name', name, '--passphrase', passphrase, '-v', vaultPath]);
            vscode.window.showInformationMessage(`Credential ${name} encrypted and added successfully.`);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to add credential: ${e.message}`);
        }
    });
}
