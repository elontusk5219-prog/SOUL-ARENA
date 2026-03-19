import { NextRequest, NextResponse } from "next/server";

import { clearOpenClawBindingForSlot } from "@/lib/openclaw";
import { clearSecondMeSession } from "@/lib/secondme";

export async function POST(request: NextRequest) {
  const slot = request.nextUrl.searchParams.get("slot");
  if (slot === "alpha" || slot === "beta") {
    await clearSecondMeSession(slot);
    await clearOpenClawBindingForSlot(slot);
  } else {
    await clearSecondMeSession();
  }
  return NextResponse.json({ ok: true });
}
