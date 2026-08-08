import * as crypto from "node:crypto";

function generateShortId(): string {
	const chars =
		"useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
	let id = "";
	const bytes = crypto.randomBytes(21);
	for (let i = 0; i < 21; i++) {
		id += chars[bytes[i] & 63];
	}
	return id;
}

export class WorkflowSanitizer {
	static sanitize(json: Record<string, unknown>): boolean {
		let isModified = false;

		// 1. Ensure Root properties
		if (!json.id) {
			json.id = generateShortId();
			isModified = true;
		}
		if (!json.version) {
			json.version = "1.28.0";
			isModified = true;
		}

		const isPackage = !(json.drawflow as Record<string, unknown>) && (json.data as Record<string, unknown>);
		const idMap = new Map<string, string>();

		let nodes: Record<string, unknown>[] = [];
		let edges: Record<string, unknown>[] = [];

		if (isPackage && (json.data as Record<string, unknown>)) {
			if (Array.isArray((json.data as Record<string, unknown>).nodes)) nodes = (json.data as Record<string, unknown>).nodes;
			if (Array.isArray((json.data as Record<string, unknown>).edges)) edges = (json.data as Record<string, unknown>).edges;
		} else if (!isPackage && (json.drawflow as Record<string, unknown>)) {
			if (Array.isArray((json.drawflow as Record<string, unknown>).nodes)) nodes = (json.drawflow as Record<string, unknown>).nodes;
			if (Array.isArray((json.drawflow as Record<string, unknown>).edges)) edges = (json.drawflow as Record<string, unknown>).edges;
			// Fallback for object-based nodes
			if (
				!Array.isArray((json.drawflow as Record<string, unknown>).nodes) &&
				((json.drawflow as Record<string, unknown>).Home as Record<string, unknown>) &&
				((json.drawflow as Record<string, unknown>).Home as Record<string, unknown>).data
			) {
				Object.entries(((json.drawflow as Record<string, unknown>).Home as Record<string, unknown>).data).forEach(
					([key, node]: [string, unknown]) => {
						if (!(node.id as string)) (node.id as string) = key;
						nodes.push(node);
					},
				);
				(json.drawflow as Record<string, unknown>).nodes = nodes; // normalize to array
				isModified = true;
			}
		}

		const idRegex = /^[A-Za-z0-9_-]{4,21}$/;
		const validTypes = [
			"BlockBasic",
			"BlockDelay",
			"BlockRepeatTask",
			"BlockConditions",
			"BlockElementExists",
			"BlockBasicWithFallback",
			"BlockLoopBreakpoint",
			"BlockGroup",
			"BlockGroup2",
			"BlockPackage",
			"BlockNote",
			"BlockWebhook",
		];

		const sanitizeNodesAndEdges = (
			nList: Record<string, unknown>[],
			eList: Record<string, unknown>[],
		) => {
			// Sanitize Nodes
			nList.forEach((node: Record<string, unknown>) => {
				const originalId = (node.id as string);
				if (!(node.id as string) || !idRegex.test((node.id as string))) {
					const newId = generateShortId();
					(node.id as string) = newId;
					if (originalId) idMap.set(originalId, newId);
					isModified = true;
				}

				if (!(node.type as string) || !validTypes.includes((node.type as string))) {
					(node.type as string) = "BlockBasic";
					isModified = true;
				}

				if ((node.data as Record<string, unknown>)) {
					if (typeof (node.data as Record<string, unknown>).disableBlock !== "boolean") {
						(node.data as Record<string, unknown>).disableBlock = false;
						isModified = true;
					}

					// Recursively sanitize nested nodes/edges (e.g. in BlockPackage/BlockGroup)
					const nestedData = (node.data as Record<string, unknown>).data ? (node.data as Record<string, unknown>).data : (node.data as Record<string, unknown>);
					if (
						nestedData &&
						Array.isArray(nestedData.nodes) &&
						Array.isArray(nestedData.edges)
					) {
						sanitizeNodesAndEdges(nestedData.nodes, nestedData.edges);
					}
				}
			});

			// Sanitize Edges
			eList.forEach((edge: Record<string, unknown>) => {
				if (!(edge.id as string) || !idRegex.test((edge.id as string))) {
					(edge.id as string) = generateShortId();
					isModified = true;
				}

				if (edge.source && idMap.has(edge.source as string)) {
					const newSource =
						idMap.get(edge.source as string) || (edge.source as string);
					if ((edge.sourceHandle as string)) {
						(edge.sourceHandle as string) = (edge.sourceHandle as string).replace(
							edge.source,
							newSource,
						);
					}
					edge.source = newSource;
					isModified = true;
				}

				if (edge.target && idMap.has(edge.target as string)) {
					const newTarget =
						idMap.get(edge.target as string) || (edge.target as string);
					if ((edge.targetHandle as string)) {
						(edge.targetHandle as string) = (edge.targetHandle as string).replace(
							edge.target,
							newTarget,
						);
					}
					edge.target = newTarget;
					isModified = true;
				}
			});
		};

		sanitizeNodesAndEdges(nodes, edges);

		return isModified;
	}
}
