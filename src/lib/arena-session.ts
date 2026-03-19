import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import type {
  ArenaParticipantSlot,
  ParticipantProvider,
} from "@/lib/arena-types";

const sessionCookie = "soul_arena_session_id";
const providerCookie = (slot: ArenaParticipantSlot) => `soul_arena_provider_${slot}`;
const cookieOptions = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 30,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

const normalizeProvider = (value?: string | null): ParticipantProvider =>
  value === "openclaw" ? "openclaw" : "secondme";

export const getArenaSessionId = async () => {
  const cookieStore = await cookies();
  const current = cookieStore.get(sessionCookie)?.value;

  if (current) {
    return current;
  }

  const created = randomUUID();
  cookieStore.set(sessionCookie, created, cookieOptions);
  return created;
};

export const getActiveParticipantProvider = async (
  slot: ArenaParticipantSlot,
) => {
  const cookieStore = await cookies();
  return normalizeProvider(cookieStore.get(providerCookie(slot))?.value);
};

export const setActiveParticipantProvider = async ({
  provider,
  slot,
}: {
  provider: ParticipantProvider;
  slot: ArenaParticipantSlot;
}) => {
  const cookieStore = await cookies();
  cookieStore.set(providerCookie(slot), provider, cookieOptions);
};
