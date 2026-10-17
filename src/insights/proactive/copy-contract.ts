/** Runtime guard for the narrow copywriter output. All money/date metrics stay outside prose. */
export interface CopyRequest {
  insightType: string;
  allowedActionKeys: string[];
  allowedFactIds: string[];
}

export type CopyResult =
  | { status: "RENDERABLE"; title: string; body: string; actionKey: string; usedFactIds: string[] }
  | { status: "UNRENDERABLE"; reason: string };

const noNumber = (s: string) => !/\p{N}/u.test(s);
const bounded = (s: unknown, max: number): s is string =>
  typeof s === "string" && s.trim().length > 0 && s.length <= max && noNumber(s);

export function validateCopyOutput(request: CopyRequest, value: unknown): CopyResult | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (obj.status === "UNRENDERABLE") {
    if (Object.keys(obj).sort().join() !== "reason,status" || !bounded(obj.reason, 160)) return null;
    return { status: "UNRENDERABLE", reason: obj.reason };
  }
  if (obj.status !== "RENDERABLE") return null;
  if (Object.keys(obj).sort().join() !== "actionKey,body,status,title,usedFactIds") return null;
  if (!bounded(obj.title, 65) || !bounded(obj.body, 180)) return null;
  if (typeof obj.actionKey !== "string" || !request.allowedActionKeys.includes(obj.actionKey)) return null;
  if (!Array.isArray(obj.usedFactIds) || obj.usedFactIds.length === 0 ||
      new Set(obj.usedFactIds).size !== obj.usedFactIds.length ||
      !obj.usedFactIds.every((id) => typeof id === "string" && request.allowedFactIds.includes(id))) return null;
  return { status: "RENDERABLE", title: obj.title, body: obj.body,
    actionKey: obj.actionKey, usedFactIds: obj.usedFactIds as string[] };
}
