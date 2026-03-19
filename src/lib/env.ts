const parseScopes = (value: string | undefined) =>
  (value ?? "user.info,user.info.shades,user.info.softmemory,chat,note.add,voice")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

const optional = (value: string | undefined) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const optionalNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  // SecondMe — optional; features degrade gracefully when missing
  SECONDME_CLIENT_ID: optional(process.env.SECONDME_CLIENT_ID),
  SECONDME_CLIENT_SECRET: optional(process.env.SECONDME_CLIENT_SECRET),
  SECONDME_REDIRECT_URI: optional(process.env.SECONDME_REDIRECT_URI),
  SECONDME_API_BASE_URL: optional(process.env.SECONDME_API_BASE_URL) ?? "https://api.mindverse.com/gate/lab",
  SECONDME_OAUTH_URL: optional(process.env.SECONDME_OAUTH_URL) ?? "https://go.second.me/oauth/",
  SECONDME_SCOPES: parseScopes(process.env.SECONDME_SCOPES),
  // Zhihu — optional; hot-topic signals degrade gracefully when missing
  ZHIHU_APP_KEY: optional(process.env.ZHIHU_APP_KEY),
  ZHIHU_APP_SECRET: optional(process.env.ZHIHU_APP_SECRET),
  ZHIHU_OPENAPI_BASE_URL: optional(process.env.ZHIHU_OPENAPI_BASE_URL),
  // OpenClaw — optional
  OPENCLAW_WORKSPACE_DIR: optional(process.env.OPENCLAW_WORKSPACE_DIR),
  OPENCLAW_RUNTIME_BASE_URL: optional(process.env.OPENCLAW_RUNTIME_BASE_URL),
  OPENCLAW_RUNTIME_TOKEN: optional(process.env.OPENCLAW_RUNTIME_TOKEN),
  OPENCLAW_RUNTIME_TIMEOUT_MS: optionalNumber(
    process.env.OPENCLAW_RUNTIME_TIMEOUT_MS,
    12000,
  ),
  // Deer API — for AI sprite generation
  DEER_API_KEY: optional(process.env.DEER_API_KEY),
} as const;
