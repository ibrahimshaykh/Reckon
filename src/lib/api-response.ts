import { NextResponse } from "next/server";

export function apiResponse<T>(data: T, init?: { status?: number }) {
  return NextResponse.json({ data }, { status: init?.status ?? 200 });
}
