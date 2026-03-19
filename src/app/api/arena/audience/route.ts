import { NextRequest, NextResponse } from "next/server";

import { getArenaSessionId } from "@/lib/arena-session";
import { listAudienceMembers, saveAudienceMember } from "@/lib/arena-store";

export async function GET() {
  const sessionId = await getArenaSessionId();
  const members = listAudienceMembers(sessionId);
  return NextResponse.json({ members });
}

export async function POST(request: NextRequest) {
  const sessionId = await getArenaSessionId();
  const body = (await request.json()) as {
    displayName?: string;
    displayId?: string;
    avatarDataUrl?: string;
  };

  if (!body.displayName?.trim()) {
    return NextResponse.json({ message: "displayName is required" }, { status: 400 });
  }

  const member = saveAudienceMember({
    sessionId,
    displayName: body.displayName.trim(),
    displayId: body.displayId?.trim(),
    avatarDataUrl: body.avatarDataUrl,
  });

  return NextResponse.json({ member });
}
