export class WorkflowParser {
	public static extractImplicitVariables(content: string): Set<string> {
		const implicitVars = new Set<string>();

		// 1. Scan for {{variables.xyz}}
		const varRegex1 = /\{\{\s*variables\.([a-zA-Z0-9_$.-]+)\s*\}\}/g;
		for (const match of content.matchAll(varRegex1)) {
			implicitVars.add(match[1]);
		}

		// 2. Scan for automaRefData('variables', 'xyz')
		const varRegex2 =
			/automaRefData\(\s*['"]variables['"]\s*,\s*['"]([a-zA-Z0-9_$.-]+)['"]\s*\)/g;
		for (const match of content.matchAll(varRegex2)) {
			implicitVars.add(match[1]);
		}

		return implicitVars;
	}

	public static extractTriggerParameters(
		jsonObj: unknown,
		implicitVars: Set<string>,
	): Record<string, unknown>[] {
		const triggerParams: Record<string, unknown>[] = [];
		let nodesList: Record<string, unknown>[] = [];

		const json = (jsonObj || {}) as Record<string, unknown>;

		if (
			(json as Record<string, unknown>).data &&
			typeof (json as Record<string, unknown>).data === "object" &&
			Array.isArray(
				((json as Record<string, unknown>).data as Record<string, unknown>)
					.nodes,
			)
		) {
			nodesList = (
				(json as Record<string, unknown>).data as Record<string, unknown>
			).nodes as Record<string, unknown>[];
		} else if (
			(json as Record<string, unknown>).drawflow &&
			typeof (json as Record<string, unknown>).drawflow === "object"
		) {
			const drawflow = (json as Record<string, unknown>).drawflow as Record<
				string,
				unknown
			>;
			if (Array.isArray(drawflow.nodes)) {
				nodesList = drawflow.nodes as Record<string, unknown>[];
			} else {
				Object.keys(drawflow).forEach((tab) => {
					const tabData = drawflow[tab] as Record<string, unknown>;
					if (tabData?.data) {
						Object.entries(tabData.data as Record<string, unknown>).forEach(
							([_key, node]: [string, unknown]) => {
								nodesList.push(node as Record<string, unknown>);
							},
						);
					}
				});
			}
		}

		if (nodesList.length > 0) {
			for (const node of nodesList) {
				if (
					((node as Record<string, unknown>).label === "trigger" ||
						(node as Record<string, unknown>).name === "trigger" ||
						(node as Record<string, unknown>).type === "BlockTrigger") &&
					(node as Record<string, unknown>).data &&
					typeof (node as Record<string, unknown>).data === "object" &&
					Array.isArray(
						((node as Record<string, unknown>).data as Record<string, unknown>)
							.parameters,
					)
				) {
					for (const param of (
						(node as Record<string, unknown>).data as Record<string, unknown>
					).parameters as Record<string, unknown>[]) {
						if (
							(param as Record<string, unknown>).name &&
							!triggerParams.some(
								(p) => p.name === (param as Record<string, unknown>).name,
							)
						) {
							triggerParams.push({
								...param,
								isImplicit: false,
							});
							implicitVars.delete(
								(param as Record<string, unknown>).name as string,
							);
						}
					}
				}
			}
		}
		return triggerParams;
	}
}
