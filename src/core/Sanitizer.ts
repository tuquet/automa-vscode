import * as crypto from "node:crypto";
import {
	castRecord,
	castRecordArray,
	hasNodesAndEdges,
	hasObjectProp,
	isBoolean,
} from "../utils/typeGuards";

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

export const WorkflowSanitizer = {
	sanitize(json: Record<string, unknown>): boolean {
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

		const isPackage = !json.drawflow && json.data;
		const idMap = new Map<string, string>();

		let nodes: Record<string, unknown>[] = [];
		let edges: Record<string, unknown>[] = [];

		if (isPackage && hasObjectProp(json, "data")) {
			if (Array.isArray(json.data.nodes))
				nodes = castRecordArray(json.data.nodes);
			if (Array.isArray(json.data.edges))
				edges = castRecordArray(json.data.edges);
		} else if (!isPackage && hasObjectProp(json, "drawflow")) {
			if (Array.isArray(json.drawflow.nodes))
				nodes = castRecordArray(json.drawflow.nodes);
			if (Array.isArray(json.drawflow.edges))
				edges = castRecordArray(json.drawflow.edges);

			// Fallback for object-based nodes
			if (
				!Array.isArray(json.drawflow.nodes) &&
				hasObjectProp(json.drawflow, "Home") &&
				hasObjectProp(json.drawflow.Home, "data")
			) {
				Object.entries(json.drawflow.Home.data).forEach(([key, node]) => {
					const n = castRecord(node);
					if (!n.id) n.id = key;
					nodes.push(n);
				});
				json.drawflow.nodes = nodes; // normalize to array
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
				const originalId = node.id;
				if (!node.id || !idRegex.test(String(node.id))) {
					const newId = generateShortId();
					node.id = newId;
					if (originalId) idMap.set(String(originalId), newId);
					isModified = true;
				}

				if (!node.type || !validTypes.includes(String(node.type))) {
					node.type = "BlockBasic";
					isModified = true;
				}

				if (node.data) {
					const nodeData = castRecord(node.data);
					if (!isBoolean(nodeData.disableBlock)) {
						nodeData.disableBlock = false;
						isModified = true;
					}

					// Recursively sanitize nested nodes/edges (e.g. in BlockPackage/BlockGroup)
					const nestedData = nodeData.data ? nodeData.data : nodeData;
					if (hasNodesAndEdges(nestedData)) {
						sanitizeNodesAndEdges(nestedData.nodes, nestedData.edges);
					}
				}
			});

			// Sanitize Edges
			eList.forEach((edge: Record<string, unknown>) => {
				if (!edge.id || !idRegex.test(String(edge.id))) {
					edge.id = generateShortId();
					isModified = true;
				}

				if (edge.source && idMap.has(edge.source as string)) {
					const newSource =
						idMap.get(edge.source as string) || (edge.source as string);
					if (edge.sourceHandle) {
						edge.sourceHandle = String(edge.sourceHandle).replace(
							String(edge.source),
							newSource,
						);
					}
					edge.source = newSource;
					isModified = true;
				}

				if (edge.target && idMap.has(edge.target as string)) {
					const newTarget =
						idMap.get(edge.target as string) || (edge.target as string);
					if (edge.targetHandle) {
						edge.targetHandle = String(edge.targetHandle).replace(
							String(edge.target),
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
	},
};
