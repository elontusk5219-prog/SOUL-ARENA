import { NextRequest, NextResponse } from "next/server";

import {
  getActiveParticipantProvider,
  setActiveParticipantProvider,
} from "@/lib/arena-session";
import { listArenaParticipants } from "@/lib/arena-participants";
import { clearOpenClawBindingForSlot } from "@/lib/openclaw";
import { clearSecondMeSession } from "@/lib/secondme";
import type { ParticipantProvider } from "@/lib/arena-types";

export async function GET() {
  const participants = await listArenaParticipants();

  return NextResponse.json({
    participants,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    provider?: ParticipantProvider;
    slot?: string;
  };

  if ((body.slot !== "alpha" && body.slot !== "beta") || !body.provider) {
    return NextResponse.json(
      {
        message: "slot 和 provider 为必填项",
      },
      { status: 400 },
    );
  }

  if (body.provider !== "secondme" && body.provider !== "openclaw") {
    return NextResponse.json(
      {
        message: "provider 必须是 secondme 或 openclaw",
      },
      { status: 400 },
    );
  }

  await setActiveParticipantProvider({
    provider: body.provider,
    slot: body.slot,
  });

  return NextResponse.json({
    ok: true,
    provider: body.provider,
    slot: body.slot,
  });
}

export async function DELETE(request: NextRequest) {
  const slot = request.nextUrl.searchParams.get("slot");

  if (slot !== "alpha" && slot !== "beta") {
    return NextResponse.json(
      {
        message: "slot 必须是 alpha 或 beta",
      },
      { status: 400 },
    );
  }

  const provider = await getActiveParticipantProvider(slot);

  if (provider === "openclaw") {
    await clearOpenClawBindingForSlot(slot);
  } else {
    await clearSecondMeSession(slot);
  }

  return NextResponse.json({
    ok: true,
    provider,
    slot,
  });
}
