export class WorkflowParser {
	public static extractImplicitVariables(content: string): Set<string> {
		const implicitVars = new Set<string>();

		// 1. Scan for {{variables.xyz}}
		const varRegex1 = /\{\{\s*variables\.([a-zA-Z0-9_$]+)\s*\}\}/g;
		let match;
		while ((match = varRegex1.exec(content)) !== null) {
			implicitVars.add(match[1]);
		}

		// 2. Scan for automaRefData('variables', 'xyz')
		const varRegex2 =
			/automaRefData\(\s*['"]variables['"]\s*,\s*['"]([a-zA-Z0-9_$]+)['"]\s*\)/g;
		while ((match = varRegex2.exec(content)) !== null) {
			implicitVars.add(match[1]);
		}

		return implicitVars;
	}

	public static extractTriggerParameters(
		json: any,
		implicitVars: Set<string>,
	): Record<string, unknown>[] {
		const triggerParams: Record<string, unknown>[] = [];
		let nodesList: Record<string, unknown>[] = [];

		if (json.data && Array.isArray(json.data.nodes)) {
			nodesList = json.data.nodes;
		} else if (json.drawflow) {
			if (Array.isArray(json.drawflow.nodes)) {
				nodesList = json.drawflow.nodes;
			} else {
				Object.keys(json.drawflow).forEach((tab) => {
					if (json.drawflow[tab] && json.drawflow[tab].data) {
						Object.entries(json.drawflow[tab].data).forEach(
							([_key, node]: [string, Record<string, unknown>]) => {
								nodesList.push(node);
							},
						);
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
					Array.isArray(node.data?.parameters)
				) {
					for (const param of node.data.parameters) {
						if (
							param.name &&
							!triggerParams.some((p) => p.name === param.name)
						) {
							triggerParams.push({
								...param,
								isImplicit: false,
							});
							implicitVars.delete(param.name);
						}
					}
				}
			}
		}
		return triggerParams;
	}
}
