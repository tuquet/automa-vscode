import * as crypto from "node:crypto";

function generateShortId(): string {
	const chars = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
	let id = "";
	const bytes = crypto.randomBytes(21);
	for (let i = 0; i < 21; i++) {
		id += chars[bytes[i] & 63];
	}
	return id;
}

export class WorkflowSanitizer {
	static sanitize(json: any): boolean {
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

		let nodes: any[] = [];
		let edges: any[] = [];

		if (isPackage && json.data) {
			if (Array.isArray(json.data.nodes)) nodes = json.data.nodes;
			if (Array.isArray(json.data.edges)) edges = json.data.edges;
		} else if (!isPackage && json.drawflow) {
			if (Array.isArray(json.drawflow.nodes)) nodes = json.drawflow.nodes;
			if (Array.isArray(json.drawflow.edges)) edges = json.drawflow.edges;
			// Fallback for object-based nodes
			if (!Array.isArray(json.drawflow.nodes) && json.drawflow.Home && json.drawflow.Home.data) {
				Object.entries(json.drawflow.Home.data).forEach(([key, node]: [string, any]) => {
					if (!node.id) node.id = key;
					nodes.push(node);
				});
				json.drawflow.nodes = nodes; // normalize to array
				isModified = true;
			}
		}

		const idRegex = /^[A-Za-z0-9_-]{4,21}$/;
		const validTypes = ["BlockBasic", "BlockDelay", "BlockRepeatTask", "BlockConditions", "BlockElementExists", "BlockBasicWithFallback", "BlockLoopBreakpoint", "BlockGroup", "BlockGroup2", "BlockPackage", "BlockNote", "BlockWebhook"];

		// 3. Sanitize Nodes
		nodes.forEach((node: any) => {
			let originalId = node.id;
			if (!node.id || !idRegex.test(node.id)) {
				const newId = generateShortId();
				node.id = newId;
				if (originalId) idMap.set(originalId, newId);
				isModified = true;
			}
			
			if (!node.type || !validTypes.includes(node.type)) {
				node.type = "BlockBasic";
				isModified = true;
			}

			if (node.data) {
				if (typeof node.data.disableBlock !== "boolean") {
					node.data.disableBlock = false;
					isModified = true;
				}
			}
		});

		// 4. Sanitize Edges
		edges.forEach((edge: any) => {
			if (!edge.id || !idRegex.test(edge.id)) {
				edge.id = generateShortId();
				isModified = true;
			}

			if (edge.source && idMap.has(edge.source)) {
				const newSource = idMap.get(edge.source)!;
				if (edge.sourceHandle) {
					edge.sourceHandle = edge.sourceHandle.replace(edge.source, newSource);
				}
				edge.source = newSource;
				isModified = true;
			}

			if (edge.target && idMap.has(edge.target)) {
				const newTarget = idMap.get(edge.target)!;
				if (edge.targetHandle) {
					edge.targetHandle = edge.targetHandle.replace(edge.target, newTarget);
				}
				edge.target = newTarget;
				isModified = true;
			}
		});

		return isModified;
	}
}
