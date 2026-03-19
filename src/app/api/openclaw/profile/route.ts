import { NextRequest, NextResponse } from "next/server";

import {
  getCurrentOpenClawParticipantSource,
  getOpenClawParticipantSource,
} from "@/lib/openclaw";

export async function GET(request: NextRequest) {
  const slot = request.nextUrl.searchParams.get("slot");
  const participantId = request.nextUrl.searchParams.get("participantId") ?? undefined;

  if (slot !== "alpha" && slot !== "beta") {
    return NextResponse.json(
      {
        message: "slot 必须是 alpha 或 beta",
      },
      { status: 400 },
    );
  }

  const participant = participantId
    ? await getOpenClawParticipantSource({
        participantId,
        slot,
      })
    : await getCurrentOpenClawParticipantSource(slot);

  return NextResponse.json({
    participant:
      participant ??
      ({
        connected: false,
        provider: "openclaw",
        slot,
      } as const),
  });
}
