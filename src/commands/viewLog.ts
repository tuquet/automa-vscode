import * as vscode from "vscode";
import { AutomaClient } from "../core/AutomaClient";
import { TerminalManager } from "../core/TerminalManager";
import type { JobItem } from "../providers/HistoryTreeProvider";

export async function viewLogCommand(node: JobItem) {
	try {
		const logOutputChannel = TerminalManager.getOutputChannel();
		logOutputChannel.show(true);
		logOutputChannel.clear();
		logOutputChannel.appendLine(`Fetching logs for job: ${node.job.id}...`);

		const logs = await AutomaClient.getJobLogs(node.job.id);

		if (!Array.isArray(logs)) {
			if (logs && "error" in logs) {
				logOutputChannel.appendLine(`Error: ${logs.error}`);
			} else {
				logOutputChannel.appendLine("Error: Unexpected log format returned.");
			}
			return;
		}

		logOutputChannel.clear();
		logOutputChannel.appendLine(`=== LOGS FOR JOB: ${node.job.id} ===`);
		logOutputChannel.appendLine(
			`Status: ${node.job.status} | Created: ${node.job.created_at}`,
		);
		logOutputChannel.appendLine(
			`---------------------------------------------------`,
		);

		if (logs.length === 0) {
			logOutputChannel.appendLine(`No logs found.`);
		} else {
			for (const log of logs) {
				let text = log.message;
				try {
					const parsedMsg = JSON.parse(log.message);
					if (parsedMsg.name || parsedMsg.description) {
						const blockName = parsedMsg.name || parsedMsg.blockId || "unknown";
						const desc = parsedMsg.description || "";
						const status =
							parsedMsg.type === "error" || parsedMsg.status === "error"
								? "LỖI"
								: "THÀNH CÔNG";
						const errText = parsedMsg.message ? `: ${parsedMsg.message}` : "";
						const durationText = parsedMsg.duration
							? ` (${parsedMsg.duration}ms)`
							: "";
						text = `[Block: ${blockName}] ${desc} - ${status}${errText}${durationText}`;
					}
				} catch (_e) {}
				logOutputChannel.appendLine(
					`[${log.created_at}] [${log.type}] ${text}`,
				);
			}
		}
	} catch (error: any) {
		vscode.window.showErrorMessage(`Failed to fetch logs: ${error.message}`);
	}
}
