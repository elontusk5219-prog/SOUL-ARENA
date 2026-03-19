import { NextRequest, NextResponse } from "next/server";

import { resolveArenaParticipants } from "@/lib/arena-participants";
import { buildArenaPreview } from "@/lib/arena-engine";
import type { ArenaBattleSetup } from "@/lib/arena-types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<ArenaBattleSetup>;

  if (!body.topicId || !body.participants?.length) {
    return NextResponse.json(
      {
        message: "缺少 topicId 或 participants",
      },
      { status: 400 },
    );
  }

  const participants = await resolveArenaParticipants(body.participants);
  const disconnected = participants.filter((participant) => !participant.connected);

  if (disconnected.length > 0) {
    return NextResponse.json(
      {
        message: "甲方和乙方都必须先完成来源连接",
        participants,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await buildArenaPreview(body as ArenaBattleSetup, participants),
  );
}
