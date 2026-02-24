# LinkGuard Telegram Bot (Node.js + TypeScript + Vercel)

بوت Telegram لفحص أول رابط `http/https` في الرسالة باستخدام مزوّد واحد قابل للتبديل عبر متغير بيئة:

- الافتراضي: `Google Safe Browsing`
- بديل: `VirusTotal`

المشروع مصمم كـ webhook serverless على Vercel باستخدام endpoint واحد:

- `POST /api/telegram/webhook`

## Folder Structure

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

## Features

- استخراج أول رابط `http/https` من رسالة Telegram.
- Validate + Normalize للرابط (IDN إلى punycode).
- حظر:
  - `localhost`
  - `127.0.0.1`
  - `169.254.169.254`
  - عناوين private (`10/8`, `172.16/12`, `192.168/16`) عند كونها IP مباشر أو عند resolve للنطاق (best effort).
- لا يتم تحميل محتوى الرابط نهائيًا.
- مزوّد فحص واحد نشط حسب `ACTIVE_PROVIDER`.
- timeout افتراضي `12s` + retries حتى محاولتين إضافيتين للأخطاء العابرة (`429/5xx`).
- in-memory cache TTL + in-memory rate limit (best effort في serverless).
- ردود عربية بالكامل.

## Environment Variables

انسخ `.env.example` إلى `.env` واملأ القيم:

- `TELEGRAM_BOT_TOKEN`
- `GOOGLE_SAFE_BROWSING_KEY`
- `VIRUSTOTAL_API_KEY`
- `ACTIVE_PROVIDER` (`google` أو `virustotal`) والافتراضي `google`
- `WEBHOOK_SECRET` (اختياري)

> إذا أردت التبديل بين Google وVirusTotal: غيّر قيمة واحدة فقط `ACTIVE_PROVIDER`.

## Telegram Bot Setup

1. أنشئ بوت عبر `@BotFather` واحصل على `TELEGRAM_BOT_TOKEN`.

2. اضبط webhook:

```bash
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<VERCEL_DOMAIN>/api/telegram/webhook
```

3. تحقق من webhook:

```bash
https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

### Optional Secret Validation

هذا المشروع يعتمد **Telegram secret token header**:

- Header: `x-telegram-bot-api-secret-token`

إذا ضبطت `WEBHOOK_SECRET`، فعند setWebhook استخدم:

```bash
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<VERCEL_DOMAIN>/api/telegram/webhook&secret_token=<WEBHOOK_SECRET>
```

## Local Run

```bash
npm install
npm run dev
```

سيرفر Vercel المحلي سيكون على:

- `http://localhost:3000/api/health`
- `http://localhost:3000/api/telegram/webhook`

## Deploy to Vercel

1. اربط المشروع بـ Vercel:

```bash
npx vercel
```

2. أضف Environment Variables في Vercel Project Settings:

- `TELEGRAM_BOT_TOKEN`
- `GOOGLE_SAFE_BROWSING_KEY`
- `VIRUSTOTAL_API_KEY`
- `ACTIVE_PROVIDER`
- `WEBHOOK_SECRET` (اختياري)

3. نفّذ deploy للإنتاج:

```bash
npx vercel --prod
```

4. بعد الحصول على الدومين النهائي، نفّذ `setWebhook` باستخدام رابط `/api/telegram/webhook`.

## Arabic Messages Used

- `/start`:
  - `أرسل رابطًا (http/https) وسأفحصه وأرجع لك النتيجة.`
- لا يوجد رابط صالح:
  - `أرسل رابط صحيح يبدأ بـ http:// أو https://`
- Rate limit:
  - `خفّف السرعة 🙂 جرّب بعد دقيقة.`
- فشل المزود:
  - `تعذر الفحص حالياً. حاول لاحقاً.`

Verdict labels:

- `SAFE => ✅ آمن`
- `SUSPICIOUS => ⚠️ مشبوه`
- `MALICIOUS => 🚫 خبيث`
- `UNKNOWN => ❓ غير معروف`

## Example User Messages and Bot Replies

1. User:
   - `/start`

   Bot:
   - `أرسل رابطًا (http/https) وسأفحصه وأرجع لك النتيجة.`

2. User:
   - `مرحبا`

   Bot:
   - `أرسل رابط صحيح يبدأ بـ http:// أو https://`

3. User:
   - `افحص هذا: https://example.com`

   Bot (مثال SAFE):
   - `النتيجة: ✅ آمن`
   - `الرابط الأصلي: https://example.com`
   - `الرابط المعياري: https://example.com/`
   - `المزوّد: Google Safe Browsing`
   - `السبب: لم يتم العثور على تهديدات معروفة.`
   - `الدرجة: 0`

4. User:
   - `check http://127.0.0.1/admin`

   Bot (مثال UNKNOWN مع حظر محلي):
   - `النتيجة: ❓ غير معروف`
   - `الرابط الأصلي: http://127.0.0.1/admin`
   - `الرابط المعياري: http://127.0.0.1/admin`
   - `المزوّد: Google Safe Browsing (تصفية محلية)`
   - `السبب: الرابط يشير إلى عنوان localhost/loopback غير مسموح.`
   - `الدرجة: غير متاحة`

5. User:
   - `https://test.example` (مع تجاوز limit)

   Bot:
   - `خفّف السرعة 🙂 جرّب بعد دقيقة.`

## Notes

- الذاكرة المؤقتة وrate-limit داخل الذاكرة فقط، لذلك سلوكهما best effort مع serverless cold starts.
- لا توجد قاعدة بيانات.
- المشروع يعمل مباشرة بعد تعبئة متغيرات البيئة وضبط webhook.
