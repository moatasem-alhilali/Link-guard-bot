import axios, { AxiosError } from "axios";
import { config, requireEnv } from "./config";

export interface TelegramMessage {
  message_id: number;
  text?: string;
  caption?: string;
  chat: {
    id: number;
    type: string;
  };
  from?: {
    id: number;
    is_bot?: boolean;
    first_name?: string;
    username?: string;
  };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const TELEGRAM_SAFE_CHUNK_SIZE = 3800;

export function getMessageFromUpdate(update: TelegramUpdate): TelegramMessage | null {
  return (
    update.message ??
    update.edited_message ??
    update.channel_post ??
    update.edited_channel_post ??
    null
  );
}

export function getMessageText(message: TelegramMessage): string {
  return (message.text ?? message.caption ?? "").trim();
}

function isTransientTelegramError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return true;
  }

  const status = error.response?.status;
  if (!status) {
    return true;
  }

  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  replyToMessageId?: number
): Promise<void> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  };

  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
    payload.allow_sending_without_reply = true;
  }

  let attempt = 0;
  const maxAttempts = config.maxRetries + 1;

  while (attempt < maxAttempts) {
    try {
      await axios.post(url, payload, { timeout: config.requestTimeoutMs });
      return;
    } catch (error) {
      attempt += 1;
      if (attempt >= maxAttempts || !isTransientTelegramError(error)) {
        const message = error instanceof AxiosError ? error.message : "Unknown Telegram API error";
        throw new Error(`Failed to send Telegram message: ${message}`);
      }

      await sleep(250 * attempt);
    }
  }
}

function splitByLength(value: string, chunkSize: number): string[] {
  if (value.length <= chunkSize) {
    return [value];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    let end = Math.min(cursor + chunkSize, value.length);
    if (end < value.length) {
      const newlineIndex = value.lastIndexOf("\n", end);
      if (newlineIndex > cursor + Math.floor(chunkSize * 0.6)) {
        end = newlineIndex;
      }
    }

    chunks.push(value.slice(cursor, end).trim());
    cursor = end;

    while (value[cursor] === "\n") {
      cursor += 1;
    }
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

export async function sendTelegramMessageInChunks(
  chatId: number | string,
  text: string,
  replyToMessageId?: number
): Promise<void> {
  if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
    await sendTelegramMessage(chatId, text, replyToMessageId);
    return;
  }

  const chunks = splitByLength(text, TELEGRAM_SAFE_CHUNK_SIZE);
  for (let index = 0; index < chunks.length; index += 1) {
    await sendTelegramMessage(
      chatId,
      chunks[index],
      index === 0 ? replyToMessageId : undefined
    );
  }
}
