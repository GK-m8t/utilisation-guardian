import { NextResponse } from "next/server";
import { createConsentSession } from "@/lib/connectors/bank";

export const dynamic = "force-dynamic";

/** AA simulator: create a consent session (mirrors the Setu Bridge contract). */
export async function POST() {
  return NextResponse.json(createConsentSession());
}
