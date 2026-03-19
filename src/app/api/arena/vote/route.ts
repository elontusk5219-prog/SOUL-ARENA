import { NextRequest, NextResponse } from "next/server";

import { getArenaSessionId } from "@/lib/arena-session";
import { countVotes, saveVote } from "@/lib/arena-store";
import type { VoteSide } from "@/lib/arena-types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const battleId = searchParams.get("battleId");

  if (!battleId) {
    return NextResponse.json({ message: "battleId is required" }, { status: 400 });
  }

  const sessionId = await getArenaSessionId();
  const counts = countVotes({ sessionId, battleId });
  return NextResponse.json(counts);
}

export async function POST(request: NextRequest) {
  const sessionId = await getArenaSessionId();
  const body = (await request.json()) as {
    battleId?: string;
    side?: string;
  };

  if (!body.battleId) {
    return NextResponse.json({ message: "battleId is required" }, { status: 400 });
  }

  if (body.side !== "player" && body.side !== "defender") {
    return NextResponse.json({ message: "side must be 'player' or 'defender'" }, { status: 400 });
  }

  saveVote({ sessionId, battleId: body.battleId, side: body.side as VoteSide });
  const counts = countVotes({ sessionId, battleId: body.battleId });
  return NextResponse.json({ ok: true, ...counts });
}
