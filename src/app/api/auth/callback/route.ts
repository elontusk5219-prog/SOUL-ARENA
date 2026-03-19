import { NextRequest, NextResponse } from "next/server";

import { setActiveParticipantProvider } from "@/lib/arena-session";
import {
  exchangeCodeForSession,
  getSecondMeReturnTarget,
  resolveSecondMeAuthSlotFromState,
  validateReturnedState,
} from "@/lib/secondme";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const slot = resolveSecondMeAuthSlotFromState(state);

  if (!code) {
    return NextResponse.redirect(new URL("/arena?error=missing_code", request.url));
  }

  const stateOk = await validateReturnedState(slot, state);

  try {
    await exchangeCodeForSession(code, slot);
    await setActiveParticipantProvider({
      provider: "secondme",
      slot,
    });
    const returnTo = await getSecondMeReturnTarget(slot);
    const url = new URL(returnTo, request.url);

    if (!stateOk) {
      url.searchParams.set("warning", "state_mismatch");
    }

    return NextResponse.redirect(url);
  } catch (error) {
    const url = new URL("/arena", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "oauth_failed",
    );
    return NextResponse.redirect(url);
  }
}
