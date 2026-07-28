import * as vscode from "vscode";
import { AutomaClient } from "../core/AutomaClient";

export class JobItem extends vscode.TreeItem {
	constructor(
		public readonly job: any,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
	) {
		super(job.id, collapsibleState);
		
		let localDateStr = job.created_at;
		try {
			// Ensure we parse it as UTC if it lacks 'Z'
			const dateStr = job.created_at.includes('Z') ? job.created_at : job.created_at + 'Z';
			const date = new Date(dateStr);
			if (!isNaN(date.getTime())) {
				localDateStr = date.toLocaleString();
			}
		} catch (e) {}

		this.tooltip = `Status: ${job.status}\nCreated: ${localDateStr}`;

		let iconPath = new vscode.ThemeIcon("circle-outline");
		if (job.status === "completed") {
			iconPath = new vscode.ThemeIcon(
				"pass-filled",
				new vscode.ThemeColor("testing.iconPassed"),
			);
		} else if (job.status === "failed") {
			iconPath = new vscode.ThemeIcon(
				"error",
				new vscode.ThemeColor("testing.iconFailed"),
			);
		} else if (job.status === "active" || job.status === "running") {
			iconPath = new vscode.ThemeIcon(
				"play-circle",
				new vscode.ThemeColor("testing.iconQueued"),
			);
		}

		this.iconPath = iconPath;
		this.description = `${job.status} - ${localDateStr}`;
		this.contextValue = "jobItem";

		this.command = {
			command: "automa.viewLog",
			title: "View Execution Log",
			arguments: [this],
		};
	}
}

export class HistoryTreeProvider implements vscode.TreeDataProvider<JobItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<
		JobItem | undefined | undefined
	> = new vscode.EventEmitter<JobItem | undefined | undefined>();
	readonly onDidChangeTreeData: vscode.Event<JobItem | undefined | undefined> =
		this._onDidChangeTreeData.event;

	public filterStatus: string = "all";

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	setFilter(status: string): void {
		this.filterStatus = status;
		this.refresh();
	}

	getTreeItem(element: JobItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: JobItem): Promise<JobItem[]> {
		if (element) {
			return Promise.resolve([]);
		} else {
			return await this.fetchJobs();
		}
	}

	private async fetchJobs(): Promise<JobItem[]> {
		try {
			const jobs = await AutomaClient.getHistory();
			if (!Array.isArray(jobs)) {
				if (jobs && "error" in jobs) {
					vscode.window.showErrorMessage(`Automa History Error: ${jobs.error}`);
				}
				return [];
			}

			let filteredJobs = jobs;
			if (this.filterStatus !== "all") {
				filteredJobs = jobs.filter((j) => j.status === this.filterStatus);
			}

			filteredJobs.sort((a, b) => {
				const dateA = new Date(a.created_at.includes('Z') ? a.created_at : a.created_at + 'Z').getTime();
				const dateB = new Date(b.created_at.includes('Z') ? b.created_at : b.created_at + 'Z').getTime();
				return dateB - dateA;
			});

			return filteredJobs.map(
				(job: any) => new JobItem(job, vscode.TreeItemCollapsibleState.None),
			);
		} catch (error: any) {
			vscode.window.showErrorMessage(
				`Failed to load history: ${error.message}`,
			);
			return [];
		}
	}
}
