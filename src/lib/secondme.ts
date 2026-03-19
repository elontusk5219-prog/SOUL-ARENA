import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import type { ArenaParticipantSlot } from "@/lib/arena-types";
import { env } from "@/lib/env";

const SECONDME_SLOTS = ["alpha", "beta"] as const;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const REFRESH_WINDOW_MS = 60 * 1000;
const SECURE_COOKIE = process.env.NODE_ENV === "production";

type SecondMeEnvelope<T> = {
  code: number;
  message?: string;
  data?: T;
};

type TokenPayload = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType?: string;
  scope?: string[];
};

export type SecondMeUserInfo = {
  secondMeId?: string;
  id?: string;
  name?: string;
  avatarUrl?: string;
  email?: string;
  route?: string;
  bio?: string;
  [key: string]: unknown;
};

export type SecondMeAuthSlot = (typeof SECONDME_SLOTS)[number];

type SecondMeSessionCookies = {
  accessToken?: string;
  authState?: string;
  expiresAt: number;
  refreshToken?: string;
  returnTo?: string;
};

type SecondMeActRequest = {
  actionControl: string;
  appId?: string;
  message: string;
  sessionId?: string;
  systemPrompt?: string;
};

const joinUrl = (base: string, path: string) =>
  `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

const now = () => Date.now();

const toSlot = (slot?: ArenaParticipantSlot | null): SecondMeAuthSlot =>
  slot === "beta" ? "beta" : "alpha";

const accessTokenCookie = (slot: SecondMeAuthSlot) =>
  `soul_arena_secondme_${slot}_access_token`;
const refreshTokenCookie = (slot: SecondMeAuthSlot) =>
  `soul_arena_secondme_${slot}_refresh_token`;
const expiresAtCookie = (slot: SecondMeAuthSlot) =>
  `soul_arena_secondme_${slot}_expires_at`;
const stateCookie = (slot: SecondMeAuthSlot) =>
  `soul_arena_secondme_${slot}_state`;
const returnToCookie = (slot: SecondMeAuthSlot) =>
  `soul_arena_secondme_${slot}_return_to`;

const cookieOptions = {
  httpOnly: true,
  maxAge: COOKIE_MAX_AGE,
  path: "/",
  sameSite: "lax" as const,
  secure: SECURE_COOKIE,
};

const ephemeralCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 10,
  path: "/",
  sameSite: "lax" as const,
  secure: SECURE_COOKIE,
};

const normalizeReturnTo = (value?: string | null) =>
  value && value.startsWith("/") ? value : "/arena";

const parseAuthState = (
  state: string | null,
): { slot: SecondMeAuthSlot; value: string } => {
  if (!state) {
    return { slot: "alpha" as const, value: "" };
  }

  const [maybeSlot, ...rest] = state.split(":");
  if (
    (maybeSlot === "alpha" || maybeSlot === "beta") &&
    rest.length > 0
  ) {
    return {
      slot: maybeSlot,
      value: state,
    };
  }

  return { slot: "alpha" as const, value: state };
};

const getCookieSession = async (
  slot: SecondMeAuthSlot,
): Promise<SecondMeSessionCookies> => {
  const cookieStore = await cookies();

  return {
    accessToken: cookieStore.get(accessTokenCookie(slot))?.value,
    authState: cookieStore.get(stateCookie(slot))?.value,
    expiresAt: Number(cookieStore.get(expiresAtCookie(slot))?.value ?? "0"),
    refreshToken: cookieStore.get(refreshTokenCookie(slot))?.value,
    returnTo: cookieStore.get(returnToCookie(slot))?.value,
  };
};

const clearCookie = async (name: string) => {
  const cookieStore = await cookies();
  cookieStore.set(name, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: SECURE_COOKIE,
  });
};

const clearSecondMeTransientCookies = async (slot: SecondMeAuthSlot) => {
  await clearCookie(stateCookie(slot));
  await clearCookie(returnToCookie(slot));
};

const setSessionCookies = async (
  slot: SecondMeAuthSlot,
  payload: TokenPayload,
) => {
  const cookieStore = await cookies();
  const expiresAt = now() + Math.max(payload.expiresIn - 30, 30) * 1000;

  cookieStore.set(accessTokenCookie(slot), payload.accessToken, cookieOptions);
  cookieStore.set(refreshTokenCookie(slot), payload.refreshToken, cookieOptions);
  cookieStore.set(expiresAtCookie(slot), String(expiresAt), cookieOptions);
};

const exchangeForm = async (
  endpoint: string,
  params: Record<string, string>,
): Promise<TokenPayload> => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    cache: "no-store",
  });

  const result = (await response.json()) as SecondMeEnvelope<TokenPayload>;

  if (!response.ok || result.code !== 0 || !result.data) {
    throw new Error(result.message ?? "SecondMe token request failed");
  }

  return result.data;
};

export const getSecondMeAuthSlots = () => [...SECONDME_SLOTS];

export const createSecondMeAuthUrl = async (
  slot: SecondMeAuthSlot = "alpha",
  returnTo?: string,
) => {
  if (!env.SECONDME_CLIENT_ID || !env.SECONDME_REDIRECT_URI) {
    throw new Error("SecondMe not configured");
  }

  const authSlot = toSlot(slot);
  const state = `${authSlot}:${randomUUID()}`;
  const cookieStore = await cookies();

  cookieStore.set(stateCookie(authSlot), state, ephemeralCookieOptions);
  cookieStore.set(
    returnToCookie(authSlot),
    normalizeReturnTo(returnTo),
    ephemeralCookieOptions,
  );

  const params = new URLSearchParams({
    client_id: env.SECONDME_CLIENT_ID,
    redirect_uri: env.SECONDME_REDIRECT_URI,
    response_type: "code",
    scope: env.SECONDME_SCOPES.join(" "),
    state,
  });

  return `${env.SECONDME_OAUTH_URL}?${params.toString()}`;
};

export const resolveSecondMeAuthSlotFromState = (
  state: string | null,
): SecondMeAuthSlot => parseAuthState(state).slot;

export const exchangeCodeForSession = async (
  code: string,
  slot: SecondMeAuthSlot = "alpha",
) => {
  if (!env.SECONDME_CLIENT_ID || !env.SECONDME_CLIENT_SECRET || !env.SECONDME_REDIRECT_URI) {
    throw new Error("SecondMe not configured");
  }

  const authSlot = toSlot(slot);
  const payload = await exchangeForm(
    joinUrl(env.SECONDME_API_BASE_URL, "/api/oauth/token/code"),
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: env.SECONDME_REDIRECT_URI,
      client_id: env.SECONDME_CLIENT_ID,
      client_secret: env.SECONDME_CLIENT_SECRET,
    },
  );

  await setSessionCookies(authSlot, payload);
  await clearSecondMeTransientCookies(authSlot);
  return payload;
};

export const refreshSecondMeSession = async (
  slot: SecondMeAuthSlot = "alpha",
) => {
  if (!env.SECONDME_CLIENT_ID || !env.SECONDME_CLIENT_SECRET) {
    throw new Error("SecondMe not configured");
  }

  const authSlot = toSlot(slot);
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(refreshTokenCookie(authSlot))?.value;

  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const payload = await exchangeForm(
    joinUrl(env.SECONDME_API_BASE_URL, "/api/oauth/token/refresh"),
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.SECONDME_CLIENT_ID,
      client_secret: env.SECONDME_CLIENT_SECRET,
    },
  );

  await setSessionCookies(authSlot, payload);
  return payload;
};

export const clearSecondMeSession = async (slot?: SecondMeAuthSlot) => {
  const targets = slot ? [toSlot(slot)] : [...SECONDME_SLOTS];

  await Promise.all(
    targets.flatMap((target) => [
      clearCookie(accessTokenCookie(target)),
      clearCookie(refreshTokenCookie(target)),
      clearCookie(expiresAtCookie(target)),
      clearCookie(stateCookie(target)),
      clearCookie(returnToCookie(target)),
    ]),
  );
};

export const getValidSecondMeAccessToken = async (
  slot: SecondMeAuthSlot = "alpha",
) => {
  const session = await getCookieSession(toSlot(slot));

  if (!session.accessToken && !session.refreshToken) {
    return null;
  }

  if (
    session.accessToken &&
    session.expiresAt &&
    session.expiresAt - now() > REFRESH_WINDOW_MS
  ) {
    return session.accessToken;
  }

  if (session.refreshToken) {
    const refreshed = await refreshSecondMeSession(slot);
    return refreshed.accessToken;
  }

  return session.accessToken ?? null;
};

export const getSecondMeSessionSnapshot = async (
  slot: SecondMeAuthSlot = "alpha",
) => {
  const session = await getCookieSession(toSlot(slot));

  return {
    authenticated: Boolean(session.accessToken || session.refreshToken),
    expiresAt: session.expiresAt || null,
  };
};

export const getSecondMeReturnTarget = async (
  slot: SecondMeAuthSlot = "alpha",
) => {
  const session = await getCookieSession(toSlot(slot));
  return normalizeReturnTo(session.returnTo);
};

export const validateReturnedState = async (
  slot: SecondMeAuthSlot,
  state: string | null,
) => {
  const session = await getCookieSession(toSlot(slot));

  if (!state || !session.authState) {
    return true;
  }

  return session.authState === state;
};

export const fetchSecondMeJsonForSlot = async <T>(
  slot: SecondMeAuthSlot,
  path: string,
  init?: RequestInit,
): Promise<SecondMeEnvelope<T>> => {
  const accessToken = await getValidSecondMeAccessToken(slot);

  if (!accessToken) {
    throw new Error("UNAUTHORIZED");
  }

  const response = await fetch(joinUrl(env.SECONDME_API_BASE_URL, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    const refreshed = await refreshSecondMeSession(slot).catch(() => null);

    if (!refreshed) {
      throw new Error("UNAUTHORIZED");
    }

    const retry = await fetch(joinUrl(env.SECONDME_API_BASE_URL, path), {
      ...init,
      headers: {
        Authorization: `Bearer ${refreshed.accessToken}`,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    return (await retry.json()) as SecondMeEnvelope<T>;
  }

  return (await response.json()) as SecondMeEnvelope<T>;
};

export const fetchSecondMeStreamForSlot = async (
  slot: SecondMeAuthSlot,
  path: string,
  init?: RequestInit,
) => {
  const accessToken = await getValidSecondMeAccessToken(slot);

  if (!accessToken) {
    throw new Error("UNAUTHORIZED");
  }

  return fetch(joinUrl(env.SECONDME_API_BASE_URL, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
};

const extractSecondMeStreamText = (payload: string) => {
  let combined = "";

  for (const rawLine of payload.split(/\r?\n/)) {
    if (!rawLine.startsWith("data:")) {
      continue;
    }

    const data = rawLine.slice(5).trim();

    if (!data || data === "[DONE]") {
      continue;
    }

    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const delta = parsed.choices?.[0]?.delta?.content;

      if (typeof delta === "string") {
        combined += delta;
      }
    } catch {
      combined += data;
    }
  }

  return combined.trim();
};

export const fetchSecondMeActForSlot = async <T>(
  slot: SecondMeAuthSlot,
  payload: SecondMeActRequest,
) => {
  const response = await fetchSecondMeStreamForSlot(
    slot,
    "/api/secondme/act/stream",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const body = await response.text();
  const content = extractSecondMeStreamText(body);

  if (!content) {
    throw new Error("SecondMe act stream returned empty content");
  }

  return JSON.parse(content) as T;
};

export const fetchSecondMeJson = async <T>(
  path: string,
  init?: RequestInit,
) => fetchSecondMeJsonForSlot<T>("alpha", path, init);

export const fetchSecondMeStream = async (
  path: string,
  init?: RequestInit,
) => fetchSecondMeStreamForSlot("alpha", path, init);
