import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";

const execAsync = promisify(exec);

export class AutomaClient {
	/**
	 * Execute an Automa CLI command and parse the JSON output.
	 */
	static async execJson<T>(
		args: string,
		cwd?: string,
	): Promise<T | { error: string }> {
		const workspaceCwd =
			cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		try {
			const { stdout } = await execAsync(`npx automa ${args}`, {
				cwd: workspaceCwd,
			});
			const output = stdout.trim();
			if (!output) {
				return { error: "No output received from CLI" };
			}
			return JSON.parse(output) as T;
		} catch (error: any) {
			// e.g. NPM errors, syntax errors in JSON, CLI crashes
			return { error: error.message || String(error) };
		}
	}

	static async getHistory(): Promise<any[] | { error: string }> {
		return this.execJson<any[]>("history --json");
	}

	static async getJobLogs(jobId: string): Promise<any[] | { error: string }> {
		return this.execJson<any[]>(`log ${jobId} --json`);
	}
}
