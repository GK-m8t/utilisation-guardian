import { NextRequest, NextResponse } from "next/server";
import { fetchFiData } from "@/lib/connectors/bank";

export const dynamic = "force-dynamic";

/**
 * AA simulator: FI data fetch. The grant travels back from the consent
 * screen via the redirect (stateless by design — serverless-safe); a real
 * AA would verify the consent artefact server-side instead.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (req.nextUrl.searchParams.get("granted") !== "1") {
    return NextResponse.json(
      { status: "DENIED", message: "Consent was not granted — no data leaves the FIP." },
      { status: 403 }
    );
  }
  return NextResponse.json(fetchFiData(id));
}
