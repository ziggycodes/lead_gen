import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError } from "./users";

export function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  return NextResponse.json({ error: (err as Error).message }, { status: 500 });
}

export function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function parseIds(value: unknown, max = 5000): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length || ids.length > max) return null;
  return Array.from(new Set(ids));
}
