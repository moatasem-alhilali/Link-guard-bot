export type ActiveProvider = "google" | "virustotal";

function normalizeProvider(value: string | undefined): ActiveProvider {
  if (value?.toLowerCase() === "virustotal") {
    return "virustotal";
  }
  return "google";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export const providerDisplayNames: Record<ActiveProvider, string> = {
  google: "Google Safe Browsing",
  virustotal: "VirusTotal"
};

export const config = Object.freeze({
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  googleSafeBrowsingKey: process.env.GOOGLE_SAFE_BROWSING_KEY ?? "",
  virustotalApiKey: process.env.VIRUSTOTAL_API_KEY ?? "",
  activeProvider: normalizeProvider(process.env.ACTIVE_PROVIDER),
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
  requestTimeoutMs: parsePositiveInt(process.env.REQUEST_TIMEOUT_MS, 12_000),
  maxRetries: parsePositiveInt(process.env.MAX_RETRIES, 2),
  maxUrlLength: 2048,
  cacheTtlMs: parsePositiveInt(process.env.CACHE_TTL_MS, 5 * 60 * 1000),
  rateLimitWindowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
  rateLimitMax: parsePositiveInt(process.env.RATE_LIMIT_MAX, 10)
});

export function requireEnv(
  name: "TELEGRAM_BOT_TOKEN" | "GOOGLE_SAFE_BROWSING_KEY" | "VIRUSTOTAL_API_KEY"
): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
