import { NextResponse } from "next/server";
import { bankProvider, createConsentSession } from "@/lib/connectors/bank";

export const dynamic = "force-dynamic";

/** Start a bank link: AA consent flow when the connector is on, else mock. */
export async function POST() {
  if (bankProvider() === "aa-sim") {
    const session = createConsentSession();
    return NextResponse.json({ mode: "aa-sim", url: session.url, id: session.id });
  }
  return NextResponse.json({ mode: "mock" });
}
