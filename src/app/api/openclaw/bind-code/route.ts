import { NextRequest, NextResponse } from "next/server";

import { setActiveParticipantProvider } from "@/lib/arena-session";
import { createOpenClawBindCodeForSlot } from "@/lib/openclaw";

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

  await setActiveParticipantProvider({
    provider: "openclaw",
    slot: body.slot,
  });

  const bindCode = await createOpenClawBindCodeForSlot(body.slot);
  const registerUrl = new URL("/api/openclaw/register", request.url).toString();

  return NextResponse.json({
    bindCode: bindCode.code,
    expiresAt: bindCode.expiresAt,
    registerUrl,
    slot: bindCode.slot,
  });
}
