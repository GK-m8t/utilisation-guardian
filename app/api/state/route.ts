import { NextResponse } from "next/server";
import { getState, resetState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getState());
}

/** Reset the demo back to the seeded scenario. */
export async function POST() {
  return NextResponse.json(resetState());
}
