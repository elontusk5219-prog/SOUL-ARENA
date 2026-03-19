import { NextRequest, NextResponse } from "next/server";

import { setActiveParticipantProvider } from "@/lib/arena-session";
import {
  getOpenClawParticipantSource,
  importOpenClawSoulForSlot,
} from "@/lib/openclaw";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    slot?: string;
  };

  if (body.slot !== "alpha" && body.slot !== "beta") {
    return NextResponse.json(
      {
        message: "slot 必须是 alpha 或 beta",
      },
      { status: 400 },
    );
  }

  try {
    const binding = await importOpenClawSoulForSlot(body.slot);

    await setActiveParticipantProvider({
      provider: "openclaw",
      slot: body.slot,
    });

    const participant = await getOpenClawParticipantSource({
      participantId: binding.id,
      slot: body.slot,
    });

    return NextResponse.json({
      binding,
      participant,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "导入 soul.md 失败",
      },
      { status: 400 },
    );
  }
}
