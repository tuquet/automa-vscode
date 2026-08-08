import * as crypto from "node:crypto";
import { z } from "zod";
import * as vscode from "vscode";
import { diagnosticCollection } from "../commands/lintCheck";

import { nanoid } from "nanoid";

function generateShortId(): string {
	return nanoid();
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

const NodeTypeSchema = z
	.string()
	.refine((val) => validTypes.includes(val), { message: "Unsupported node type" });

export class WorkflowSanitizer {
	static sanitize(json: Record<string, unknown>, documentUri?: vscode.Uri): boolean {
		let isModified = false;
		const warnings: vscode.Diagnostic[] = [];

		// 1. Ensure Root properties
		if (!(json as Record<string, unknown>).id) {
			(json as Record<string, unknown>).id = generateShortId();
			isModified = true;
		}
		if (!(json as Record<string, unknown>).version) {
			(json as Record<string, unknown>).version = "1.28.0";
			isModified = true;
		}

		const isPackage =
			!((json as Record<string, unknown>).drawflow as Record<
				string,
				unknown
			>) && ((json as Record<string, unknown>).data as Record<string, unknown>);
		const idMap = new Map<string, string>();

		let nodes: Record<string, unknown>[] = [];
		let edges: Record<string, unknown>[] = [];

		if (
			isPackage &&
			((json as Record<string, unknown>).data as Record<string, unknown>)
		) {
			if (
				Array.isArray(
					((json as Record<string, unknown>).data as Record<string, unknown>)
						.nodes,
				)
			)
				nodes = (
					(json as Record<string, unknown>).data as Record<string, unknown>
				).nodes as Record<string, unknown>[];
			if (
				Array.isArray(
					((json as Record<string, unknown>).data as Record<string, unknown>)
						.edges,
				)
			)
				edges = (
					(json as Record<string, unknown>).data as Record<string, unknown>
				).edges as Record<string, unknown>[];
		} else if (
			!isPackage &&
			((json as Record<string, unknown>).drawflow as Record<string, unknown>)
		) {
			if (
				Array.isArray(
					(
						(json as Record<string, unknown>).drawflow as Record<
							string,
							unknown
						>
					).nodes,
				)
			)
				nodes = (
					(json as Record<string, unknown>).drawflow as Record<string, unknown>
				).nodes as Record<string, unknown>[];
			if (
				Array.isArray(
					(
						(json as Record<string, unknown>).drawflow as Record<
							string,
							unknown
						>
					).edges,
				)
			)
				edges = (
					(json as Record<string, unknown>).drawflow as Record<string, unknown>
				).edges as Record<string, unknown>[];
			// Fallback for object-based nodes
			if (
				!Array.isArray(
					(
						(json as Record<string, unknown>).drawflow as Record<
							string,
							unknown
						>
					).nodes,
				) &&
				(((json as Record<string, unknown>).drawflow as Record<string, unknown>)
					.Home as Record<string, unknown>) &&
				(
					(
						(json as Record<string, unknown>).drawflow as Record<
							string,
							unknown
						>
					).Home as Record<string, unknown>
				).data
			) {
				Object.entries(
					(
						(
							(json as Record<string, unknown>).drawflow as Record<
								string,
								unknown
							>
						).Home as Record<string, unknown>
					).data as Record<string, unknown>,
				).forEach(([key, node]: [string, unknown]) => {
					if (!((node as Record<string, unknown>).id as string))
						((node as Record<string, unknown>).id as string) = key;
					nodes.push(node as Record<string, unknown>);
				});
				(
					(json as Record<string, unknown>).drawflow as Record<string, unknown>
				).nodes = nodes; // normalize to array
				isModified = true;
			}
		}

		const sanitizeNodesAndEdges = (
			nList: Record<string, unknown>[],
			eList: Record<string, unknown>[],
		) => {
			// Sanitize Nodes
			nList.forEach((node: Record<string, unknown>) => {
				const originalId = (node as Record<string, unknown>).id as string;
				if (
					!((node as Record<string, unknown>).id as string) ||
					!idRegex.test((node as Record<string, unknown>).id as string)
				) {
					const newId = generateShortId();
					((node as Record<string, unknown>).id as string) = newId;
					if (originalId) idMap.set(originalId, newId);
					isModified = true;
				}

				const parsedType = NodeTypeSchema.safeParse((node as Record<string, unknown>).type);
				if (!parsedType.success) {
					((node as Record<string, unknown>).type as string) = "BlockBasic";
					warnings.push(new vscode.Diagnostic(new vscode.Range(0,0,0,0), `Node ID '${originalId}': ${parsedType.error.errors[0].message}. Defaulting to BlockBasic.`, vscode.DiagnosticSeverity.Warning));
					isModified = true;
				} else if ((node as Record<string, unknown>).type !== parsedType.data) {
					((node as Record<string, unknown>).type as string) = parsedType.data;
					isModified = true;
				}

				if ((node as Record<string, unknown>).data as Record<string, unknown>) {
					if (
						typeof (
							(node as Record<string, unknown>).data as Record<string, unknown>
						).disableBlock !== "boolean"
					) {
						(
							(node as Record<string, unknown>).data as Record<string, unknown>
						).disableBlock = false;
						isModified = true;
					}

					// Recursively sanitize nested nodes/edges (e.g. in BlockPackage/BlockGroup)
					const nestedData = (
						(node as Record<string, unknown>).data as Record<string, unknown>
					).data
						? (
								(node as Record<string, unknown>).data as Record<
									string,
									unknown
								>
							).data
						: ((node as Record<string, unknown>).data as Record<
								string,
								unknown
							>);
					if (
						nestedData &&
						Array.isArray((nestedData as Record<string, unknown>).nodes) &&
						Array.isArray((nestedData as Record<string, unknown>).edges)
					) {
						sanitizeNodesAndEdges(
							(nestedData as Record<string, unknown>).nodes as Record<
								string,
								unknown
							>[],
							(nestedData as Record<string, unknown>).edges as Record<
								string,
								unknown
							>[],
						);
					}
				}
			});

			// Sanitize Edges
			eList.forEach((edge: Record<string, unknown>) => {
				if (
					!((edge as Record<string, unknown>).id as string) ||
					!idRegex.test((edge as Record<string, unknown>).id as string)
				) {
					((edge as Record<string, unknown>).id as string) = generateShortId();
					isModified = true;
				}

				if (
					(edge as Record<string, unknown>).source &&
					idMap.has((edge as Record<string, unknown>).source as string)
				) {
					const newSource =
						idMap.get((edge as Record<string, unknown>).source as string) ||
						((edge as Record<string, unknown>).source as string);
					if ((edge as Record<string, unknown>).sourceHandle as string) {
						((edge as Record<string, unknown>).sourceHandle as string) = (
							(edge as Record<string, unknown>).sourceHandle as string
						).replace(
							(edge as Record<string, unknown>).source as string,
							newSource,
						);
					}
					(edge as Record<string, unknown>).source = newSource;
					isModified = true;
				}

				if (
					(edge as Record<string, unknown>).target &&
					idMap.has((edge as Record<string, unknown>).target as string)
				) {
					const newTarget =
						idMap.get((edge as Record<string, unknown>).target as string) ||
						((edge as Record<string, unknown>).target as string);
					if ((edge as Record<string, unknown>).targetHandle as string) {
						((edge as Record<string, unknown>).targetHandle as string) = (
							(edge as Record<string, unknown>).targetHandle as string
						).replace(
							(edge as Record<string, unknown>).target as string,
							newTarget,
						);
					}
					(edge as Record<string, unknown>).target = newTarget;
					isModified = true;
				}
			});
		};

		sanitizeNodesAndEdges(nodes, edges);

		if (documentUri && diagnosticCollection) {
			const existing = diagnosticCollection.get(documentUri) || [];
			diagnosticCollection.set(documentUri, [...existing, ...warnings]);
		}

		return isModified;
	}
}
