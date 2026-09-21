import { NextRequest, NextResponse } from "next/server";
import { runChat } from "@/lib/chatAgent";
import { getState } from "@/lib/store";
import type { ChatMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Grounded chat endpoint. The reply carries the full tool trace so the UI
 * can show "how I worked this out" — the proof the answer is grounded in
 * deterministic tools, not generated numbers.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body?.messages) ? body.messages : [];
  const messages: ChatMessage[] = raw
    .filter(
      (m: unknown): m is ChatMessage =>
        !!m &&
        typeof m === "object" &&
        ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
        typeof (m as ChatMessage).content === "string"
    )
    .slice(-12); // session memory: recent turns only, held client-side

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "messages must end with a user turn" }, { status: 400 });
  }

  const reply = await runChat(getState(), messages);
  return NextResponse.json(reply);
}
