import { NextResponse } from "next/server";
import { evaluate } from "@/lib/rulesEngine";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Runs the deterministic rules engine. Every number the app shows comes from here. */
export async function POST() {
  return NextResponse.json(evaluate(getState()));
}
