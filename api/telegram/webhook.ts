import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verdictCache } from "../../src/cache";
import { config } from "../../src/config";
import { formatVerdictMessage } from "../../src/format";
import { checkUrlWithActiveProvider, getConfiguredProviderName } from "../../src/providers";
import { rateLimiter } from "../../src/rateLimit";
import {
  getMessageFromUpdate,
  getMessageText,
  sendTelegramMessageInChunks,
  type TelegramUpdate
} from "../../src/telegram";
import { extractFirstUrl, normalizeAndValidateUrl } from "../../src/urlUtils";
import type { VerdictResult } from "../../src/verdict";

const START_MESSAGE = "أرسل رابطًا (http/https) وسأفحصه وأرجع لك النتيجة.";
const NO_URL_MESSAGE = "أرسل رابط صحيح يبدأ بـ http:// أو https://";
const RATE_LIMIT_MESSAGE = "خفّف السرعة 🙂 جرّب بعد دقيقة.";
const PROVIDER_FAILURE_MESSAGE = "تعذر الفحص حالياً. حاول لاحقاً.";

function parseUpdateBody(req: VercelRequest): TelegramUpdate | null {
  if (!req.body) {
    return null;
  }

  if (typeof req.body === "object") {
    return req.body as TelegramUpdate;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as TelegramUpdate;
    } catch {
      return null;
    }
  }

  return null;
}

function isWebhookSecretValid(req: VercelRequest): boolean {
  if (!config.webhookSecret) {
    return true;
  }

  const headerValue = req.headers["x-telegram-bot-api-secret-token"];
  if (Array.isArray(headerValue)) {
    return headerValue[0] === config.webhookSecret;
  }

  return headerValue === config.webhookSecret;
}

function buildBlockedResult(reason: string): VerdictResult {
  return {
    verdict: "UNKNOWN",
    provider: `${getConfiguredProviderName()} (تصفية محلية)`,
    reason
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  if (!isWebhookSecretValid(req)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  rateLimiter.cleanup();
  verdictCache.cleanup();

  const update = parseUpdateBody(req);
  if (!update) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const message = getMessageFromUpdate(update);
  if (!message?.chat?.id) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const chatId = message.chat.id;
  const text = getMessageText(message);

  if (/^\/start\b/i.test(text)) {
    await sendTelegramMessageInChunks(chatId, START_MESSAGE, message.message_id);
    res.status(200).json({ ok: true });
    return;
  }

  const limiterKey = String(message.from?.id ?? chatId);
  const rateResult = rateLimiter.consume(limiterKey);
  if (!rateResult.allowed) {
    await sendTelegramMessageInChunks(chatId, RATE_LIMIT_MESSAGE, message.message_id);
    res.status(200).json({ ok: true });
    return;
  }

  const originalUrl = extractFirstUrl(text);
  if (!originalUrl) {
    await sendTelegramMessageInChunks(chatId, NO_URL_MESSAGE, message.message_id);
    res.status(200).json({ ok: true });
    return;
  }

  const normalized = await normalizeAndValidateUrl(originalUrl);
  if (!normalized.valid) {
    if (!normalized.blockReason) {
      await sendTelegramMessageInChunks(chatId, NO_URL_MESSAGE, message.message_id);
      res.status(200).json({ ok: true });
      return;
    }

    const blockedResult = buildBlockedResult(normalized.blockReason);
    const blockedResponse = formatVerdictMessage({
      originalUrl,
      normalizedUrl: normalized.normalizedUrl ?? originalUrl,
      result: blockedResult
    });
    await sendTelegramMessageInChunks(chatId, blockedResponse, message.message_id);
    res.status(200).json({ ok: true });
    return;
  }

  const normalizedUrl = normalized.normalizedUrl;
  if (!normalizedUrl) {
    await sendTelegramMessageInChunks(chatId, PROVIDER_FAILURE_MESSAGE, message.message_id);
    res.status(200).json({ ok: true });
    return;
  }

  const cacheKey = `${config.activeProvider}:${normalizedUrl}`;
  const cached = verdictCache.get(cacheKey);

  let result: VerdictResult;
  let fromCache = false;

  if (cached) {
    result = cached;
    fromCache = true;
  } else {
    try {
      result = await checkUrlWithActiveProvider(normalizedUrl);
      verdictCache.set(cacheKey, result);
    } catch (error) {
      console.error("Provider check failed:", error);
      await sendTelegramMessageInChunks(chatId, PROVIDER_FAILURE_MESSAGE, message.message_id);
      res.status(200).json({ ok: true });
      return;
    }
  }

  const responseText = formatVerdictMessage({
    originalUrl,
    normalizedUrl,
    result,
    fromCache
  });

  await sendTelegramMessageInChunks(chatId, responseText, message.message_id);
  res.status(200).json({ ok: true });
}
