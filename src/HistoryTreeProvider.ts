import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class JobItem extends vscode.TreeItem {
    constructor(
        public readonly job: any,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(job.id, collapsibleState);
        this.tooltip = `Status: ${job.status}\nCreated: ${job.created_at}`;
        
        let iconPath = new vscode.ThemeIcon("circle-outline");
        if (job.status === "completed") {
            iconPath = new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"));
        } else if (job.status === "failed") {
            iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
        } else if (job.status === "active" || job.status === "running") {
            iconPath = new vscode.ThemeIcon("play-circle", new vscode.ThemeColor("testing.iconQueued"));
        }

        this.iconPath = iconPath;
        this.description = `${job.status} - ${job.created_at}`;
        this.contextValue = 'jobItem';
        
        this.command = {
            command: 'automa.viewLog',
            title: 'View Execution Log',
            arguments: [this.job]
        };
    }
}

export class HistoryTreeProvider implements vscode.TreeDataProvider<JobItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<JobItem | undefined | void> = new vscode.EventEmitter<JobItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<JobItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
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
            const { stdout } = await execAsync('npx automa history --json', { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
            const jobs = JSON.parse(stdout.trim());
            
            if (jobs.error) {
                vscode.window.showErrorMessage(`Automa History Error: ${jobs.error}`);
                return [];
            }

            return jobs.map((job: any) => new JobItem(job, vscode.TreeItemCollapsibleState.None));
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to load history: ${error.message}`);
            return [];
        }
    }
}
