import { NextRequest, NextResponse } from "next/server";

import { getArenaSessionId } from "@/lib/arena-session";
import { getLiveSession, setLiveSession } from "@/lib/arena-store";

export async function GET() {
  const sessionId = await getArenaSessionId();
  const session = getLiveSession(sessionId);

  if (!session) {
    return NextResponse.json({ battleId: null, startAt: null, secondsUntilStart: null });
  }

  let secondsUntilStart: number | null = null;
  if (session.startAt) {
    const diff = (new Date(session.startAt).getTime() - Date.now()) / 1000;
    secondsUntilStart = Math.max(0, diff);
  }

  return NextResponse.json({
    battleId: session.battleId,
    startAt: session.startAt,
    secondsUntilStart,
  });
}

export async function POST(request: NextRequest) {
  const sessionId = await getArenaSessionId();
  const body = (await request.json()) as {
    battleId?: string;
    delaySeconds?: number;
  };

  if (!body.battleId) {
    return NextResponse.json({ message: "battleId is required" }, { status: 400 });
  }

  const delaySeconds = typeof body.delaySeconds === "number" ? body.delaySeconds : 5;
  const startAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

  setLiveSession({ sessionId, battleId: body.battleId, startAt });

  return NextResponse.json({ battleId: body.battleId, startAt, secondsUntilStart: delaySeconds });
}
