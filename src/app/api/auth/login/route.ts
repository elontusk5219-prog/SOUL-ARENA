import { NextRequest, NextResponse } from "next/server";

import { setActiveParticipantProvider } from "@/lib/arena-session";
import { createSecondMeAuthUrl } from "@/lib/secondme";

export async function GET(request: NextRequest) {
  const slot = request.nextUrl.searchParams.get("slot");
  const normalizedSlot = slot === "beta" ? "beta" : "alpha";
  const returnTo = request.nextUrl.searchParams.get("returnTo");
  await setActiveParticipantProvider({
    provider: "secondme",
    slot: normalizedSlot,
  });
  const authUrl = await createSecondMeAuthUrl(
    normalizedSlot,
    returnTo ?? "/arena",
  );
  return NextResponse.redirect(authUrl);
}
