import { NextResponse } from "next/server";
import type { FieldErrors } from "../model/types";

export type RouteCtx = { params: Promise<{ id: string }> };

export const missingCif = () =>
  NextResponse.json({ error: "cif is required" }, { status: 422 });

export const badBody = () =>
  NextResponse.json({ error: "invalid JSON body" }, { status: 422 });

export const invalid = (errors: FieldErrors) =>
  NextResponse.json({ errors }, { status: 422 });

export const notFound = () =>
  NextResponse.json({ error: "not found" }, { status: 404 });

/** Parsed JSON object body, or null when the body is broken / not an object. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** Non-empty string cif, or null. */
export function cifOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
