import type { HistoryTreeProvider } from "../providers/HistoryTreeProvider";

export function refreshHistoryCommand(historyProvider: HistoryTreeProvider) {
	historyProvider.refresh();
}
