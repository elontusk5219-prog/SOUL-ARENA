import { createHmac, randomUUID } from "node:crypto";

import { env } from "@/lib/env";

type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

const responseCache = new Map<string, CacheEntry>();
let lastZhihuRequestAt = 0;
let lastZhihuSearchAt = 0;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const getCacheKey = (url: string, method: string, body?: string) =>
  `${method}:${url}:${body ?? ""}`;

const fromCache = <T>(cacheKey: string) => {
  const entry = responseCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return entry.data as T;
};

const saveCache = (cacheKey: string, data: unknown, ttlMs: number) => {
  responseCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
};

const signRequest = (timestamp: string, logId: string, appKey: string, appSecret: string, extraInfo = "") => {
  const signString = `app_key:${appKey}|ts:${timestamp}|logid:${logId}|extra_info:${extraInfo}`;
  const signature = createHmac("sha256", appSecret)
    .update(signString)
    .digest("base64");

  return {
    extraInfo,
    logId,
    signature,
    timestamp,
  };
};

const throttleZhihu = async (minimumGapMs: number) => {
  const elapsed = Date.now() - lastZhihuRequestAt;

  if (elapsed < minimumGapMs) {
    await sleep(minimumGapMs - elapsed);
  }

  lastZhihuRequestAt = Date.now();
};

const throttleSearch = async () => {
  const elapsed = Date.now() - lastZhihuSearchAt;

  if (elapsed < 1000) {
    await sleep(1000 - elapsed);
  }

  lastZhihuSearchAt = Date.now();
};

type ZhihuFetchOptions = {
  body?: Record<string, unknown>;
  cacheTtlMs?: number;
  extraInfo?: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  searchMode?: boolean;
};

export const zhihuFetchJson = async <T>(
  path: string,
  options: ZhihuFetchOptions = {},
): Promise<T | null> => {
  if (!env.ZHIHU_APP_KEY || !env.ZHIHU_APP_SECRET || !env.ZHIHU_OPENAPI_BASE_URL) {
    return null;
  }

  const appKey = env.ZHIHU_APP_KEY;
  const appSecret = env.ZHIHU_APP_SECRET;
  const baseUrl = env.ZHIHU_OPENAPI_BASE_URL;

  const method = options.method ?? "GET";
  const url = new URL(path, baseUrl);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const body = options.body ? JSON.stringify(options.body) : undefined;
  const cacheKey = getCacheKey(url.toString(), method, body);
  const cached = options.cacheTtlMs ? fromCache<T>(cacheKey) : null;

  if (cached) {
    return cached;
  }

  await throttleZhihu(120);

  if (options.searchMode) {
    await throttleSearch();
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const logId = `soularena-${randomUUID()}`;
  const auth = signRequest(timestamp, logId, appKey, appSecret, options.extraInfo ?? "");
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-App-Key": appKey,
      "X-Extra-Info": auth.extraInfo,
      "X-Log-Id": auth.logId,
      "X-Sign": auth.signature,
      "X-Timestamp": auth.timestamp,
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json()) as T;

  if (options.cacheTtlMs && response.ok) {
    saveCache(cacheKey, payload, options.cacheTtlMs);
  }

  return payload;
};
