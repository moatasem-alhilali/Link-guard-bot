# LinkGuard Bot

Serverless Telegram bot to check URLs for safety using threat intelligence APIs.

- Runtime: Node.js 20+
- Language: TypeScript
- Deployment target: Vercel
- Webhook endpoint: `POST /api/telegram/webhook`
- Default provider: Google Safe Browsing
- Bot replies: Arabic

## Overview

LinkGuard Bot receives Telegram updates through a webhook, extracts the first `http/https` URL from the message, validates and normalizes it safely, sends it to one active provider, then replies with a verdict in Arabic.

This project is intentionally simple:

- No database
- No crawling/fetching user URLs
- Single webhook endpoint
- One-toggle provider switch using `ACTIVE_PROVIDER`

## Features

- Extracts the first URL from message text/caption.
- Validates URL format and limits URL length to `2048`.
- Normalizes domains (IDN to punycode).
- Blocks sensitive hosts/IPs: `localhost`, `127.0.0.1`, `169.254.169.254`.
- Best-effort block for private ranges (`10/8`, `172.16/12`, `192.168/16`) when DNS resolves.
- Provider timeout and retry handling: timeout `12000ms`, retry up to `2` times for transient errors (`429` / `5xx`).
- In-memory TTL cache (best effort in serverless).
- In-memory rate limiting (best effort in serverless).
- Arabic response formatting with verdict labels and reason.

## How It Works

1. Telegram sends update to `/api/telegram/webhook`.
2. Bot validates optional webhook secret header.
3. Bot extracts first URL from user message.
4. URL is validated and normalized safely.
5. Active provider checks URL reputation.
6. Bot replies in Arabic with verdict, original URL, normalized URL, provider, short reason, and score (if available).

## Providers

Supported providers:

- `google` (default): Google Safe Browsing v4
- `virustotal`: VirusTotal v3

Switch provider by changing one env var only:

```env
ACTIVE_PROVIDER=google
```

or

```env
ACTIVE_PROVIDER=virustotal
```

## Project Structure

```text
/api
  /telegram
    webhook.ts
  /health.ts
/src
  config.ts
  telegram.ts
  providers.ts
  googleSafeBrowsing.ts
  virustotal.ts
  urlUtils.ts
  verdict.ts
  rateLimit.ts
  cache.ts
  format.ts
package.json
tsconfig.json
README.md
.env.example
```

## Environment Variables

Copy `.env.example` to `.env` and set values:

| Name | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Telegram bot token from BotFather |
| `GOOGLE_SAFE_BROWSING_KEY` | Required when `ACTIVE_PROVIDER=google` | - | Google Safe Browsing API key |
| `VIRUSTOTAL_API_KEY` | Required when `ACTIVE_PROVIDER=virustotal` | - | VirusTotal API key |
| `ACTIVE_PROVIDER` | No | `google` | `google` or `virustotal` |
| `WEBHOOK_SECRET` | No | empty | Validates `x-telegram-bot-api-secret-token` header |
| `REQUEST_TIMEOUT_MS` | No | `12000` | Outbound HTTP timeout |
| `MAX_RETRIES` | No | `2` | Max transient retries |
| `CACHE_TTL_MS` | No | `300000` | In-memory cache TTL |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window |
| `RATE_LIMIT_MAX` | No | `10` | Max requests per window per user/chat |

## Local Development

```bash
npm install
npm run dev
```

Local endpoints:

- `http://localhost:3000/api/health`
- `http://localhost:3000/api/telegram/webhook`

## Telegram Webhook Setup

1. Create a bot with `@BotFather` and get `TELEGRAM_BOT_TOKEN`.
2. Set webhook:

```bash
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<VERCEL_DOMAIN>/api/telegram/webhook
```

3. Check webhook info:

```bash
https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

### Optional Secret Token

This project validates Telegram's secret header:

- Header: `x-telegram-bot-api-secret-token`

If `WEBHOOK_SECRET` is set, register webhook with:

```bash
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<VERCEL_DOMAIN>/api/telegram/webhook&secret_token=<WEBHOOK_SECRET>
```

## Deploy to Vercel

1. Link the project:

```bash
npx vercel
```

2. Add environment variables in Vercel project settings.
3. Deploy production:

```bash
npx vercel --prod
```

4. Run Telegram `setWebhook` using your production domain.

### Build Settings Notes

- This repository includes `vercel.json` with:
- `buildCommand: npm run build`
- `outputDirectory: public`
- A minimal `public/index.html` is included to satisfy static output checks.

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/telegram/webhook` | `POST` | Telegram update receiver |
| `/api/health` | `GET` | Health and status endpoint |

## Arabic Bot Messages

| Case | Message |
|---|---|
| `/start` | `أرسل رابطًا (http/https) وسأفحصه وأرجع لك النتيجة.` |
| No URL | `أرسل رابط صحيح يبدأ بـ http:// أو https://` |
| Rate limit | `خفّف السرعة 🙂 جرّب بعد دقيقة.` |
| Provider failure | `تعذر الفحص حالياً. حاول لاحقاً.` |

Verdict labels:

- `SAFE => ✅ آمن`
- `SUSPICIOUS => ⚠️ مشبوه`
- `MALICIOUS => 🚫 خبيث`
- `UNKNOWN => ❓ غير معروف`

## Response Format

Each verdict reply includes:

- Verdict label
- Original URL
- Normalized URL
- Provider used
- Short reason
- Score (if available)
- Raw provider JSON (when available)

Example:

```text
النتيجة: ✅ آمن
الرابط الأصلي: https://example.com
الرابط المعياري: https://example.com/
المزوّد: Google Safe Browsing
السبب: لم يتم العثور على تهديدات معروفة.
الدرجة: 0
```

## Security Notes

- Bot never fetches the user URL content.
- URL checks are done only via provider APIs.
- URL host/IP filtering is best effort by design.
- In-memory cache and rate-limit reset on cold starts/serverless scale-out.

## Contributing

Contributions are welcome.

1. Fork the repo.
2. Create a feature branch.
3. Keep changes focused and readable.
4. Run:

```bash
npm run typecheck
```

5. Open a PR with a clear description.

## License

Add a `LICENSE` file (recommended: MIT) to make reuse terms explicit for contributors and users.
