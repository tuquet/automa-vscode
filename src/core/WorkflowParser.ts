import { hasObjectProp, isRecord } from "../utils/typeGuards";
export const WorkflowParser = {
	extractImplicitVariables(content: string): Set<string> {
		const implicitVars = new Set<string>();

		// 1. Scan for {{variables.xyz}}
		const varRegex1 = /\{\{\s*variables\.([a-zA-Z0-9_$]+)\s*\}\}/g;
		for (const match of content.matchAll(varRegex1)) {
			implicitVars.add(match[1]);
		}

		// 2. Scan for automaRefData('variables', 'xyz')
		const varRegex2 =
			/automaRefData\(\s*['"]variables['"]\s*,\s*['"]([a-zA-Z0-9_$]+)['"]\s*\)/g;
		for (const match of content.matchAll(varRegex2)) {
			implicitVars.add(match[1]);
		}

		return implicitVars;
	},

	extractTriggerParameters(
		jsonObj: unknown,
		implicitVars: Set<string>,
	): Record<string, unknown>[] {
		const triggerParams: Record<string, unknown>[] = [];
		let nodesList: Record<string, unknown>[] = [];

		const json = (jsonObj || {}) as Record<string, unknown>;

		if (hasObjectProp(json, "data") && Array.isArray(json.data.nodes)) {
			nodesList = json.data.nodes as Record<string, unknown>[];
		} else if (hasObjectProp(json, "drawflow")) {
			if (Array.isArray(json.drawflow.nodes)) {
				nodesList = json.drawflow.nodes as Record<string, unknown>[];
			} else {
				Object.values(json.drawflow).forEach((tabData) => {
					if (isRecord(tabData) && isRecord(tabData.data)) {
						Object.values(tabData.data).forEach((node) => {
							nodesList.push(node as Record<string, unknown>);
						});
					}
				});
			}
		}

		if (nodesList.length > 0) {
			for (const node of nodesList) {
				if (
					(node.label === "trigger" ||
						node.name === "trigger" ||
						node.type === "BlockTrigger") &&
					hasObjectProp(node, "data") &&
					Array.isArray(node.data.parameters)
				) {
					for (const param of node.data.parameters as Record<
						string,
						unknown
					>[]) {
						if (
							param.name &&
							!triggerParams.some((p) => p.name === param.name)
						) {
							triggerParams.push({
								...param,
								isImplicit: false,
							});
							implicitVars.delete(param.name as string);
						}
					}
				}
			}
		}
		return triggerParams;
	},
};
