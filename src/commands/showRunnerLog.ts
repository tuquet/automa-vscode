import * as vscode from "vscode";

export async function showRunnerLogCommand(execution: vscode.TaskExecution) {
	if (!execution) {
		return;
	}

	// VS Code terminals created by tasks usually have "Task - " as a prefix,
	// or match the exact task name.
	const taskName = execution.task.name;
	
	// Find the terminal that corresponds to this task
	const terminal = vscode.window.terminals.find(t => 
		t.name === taskName || 
		t.name === `Task - ${taskName}` ||
		t.name.includes(taskName)
	);

	if (terminal) {
		terminal.show();
	} else {
		vscode.window.showWarningMessage(`Could not find terminal for runner: ${taskName}`);
	}
}
