import axios from "axios";
import { config, providerDisplayNames, requireEnv } from "./config";
import type { Verdict, VerdictResult } from "./verdict";

interface GoogleMatch {
  threatType?: string;
}

interface GoogleSafeBrowsingResponse {
  matches?: GoogleMatch[];
}

const GOOGLE_ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const MALICIOUS_THREATS = new Set(["MALWARE", "POTENTIALLY_HARMFUL_APPLICATION"]);
const SUSPICIOUS_THREATS = new Set(["SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"]);
const THREAT_LABEL_AR: Record<string, string> = {
  MALWARE: "برمجيات خبيثة",
  POTENTIALLY_HARMFUL_APPLICATION: "تطبيق ضار محتمل",
  SOCIAL_ENGINEERING: "تصيّد/خداع",
  UNWANTED_SOFTWARE: "برمجيات غير مرغوبة",
  UNKNOWN: "تهديد غير معروف"
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return true;
  }

  const status = error.response?.status;
  if (!status) {
    return true;
  }

  return status === 429 || status >= 500;
}

async function postWithRetry<T>(url: string, body: unknown): Promise<T> {
  const maxAttempts = config.maxRetries + 1;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      const response = await axios.post<T>(url, body, {
        timeout: config.requestTimeoutMs,
        headers: {
          "Content-Type": "application/json"
        }
      });
      return response.data;
    } catch (error) {
      attempt += 1;
      if (attempt >= maxAttempts || !isTransientError(error)) {
        throw error;
      }

      await sleep(300 * attempt);
    }
  }

  throw new Error("Google Safe Browsing request failed after retries");
}

function mapGoogleThreatsToVerdict(threatTypes: string[]): { verdict: Verdict; reason: string } {
  const hasMalicious = threatTypes.some((type) => MALICIOUS_THREATS.has(type));
  const hasSuspicious = threatTypes.some((type) => SUSPICIOUS_THREATS.has(type));
  const threatLabels = threatTypes.map((type) => THREAT_LABEL_AR[type] ?? THREAT_LABEL_AR.UNKNOWN);
  const uniqueThreatLabels = [...new Set(threatLabels)];
  const details = uniqueThreatLabels.join("، ");

  if (hasMalicious) {
    return {
      verdict: "MALICIOUS",
      reason: `تم اكتشاف تهديدات عالية الخطورة على الرابط. نوع الخطر: ${details}.`
    };
  }

  if (hasSuspicious) {
    return {
      verdict: "SUSPICIOUS",
      reason: `تم اكتشاف مؤشرات مشبوهة على الرابط. نوع المؤشر: ${details}.`
    };
  }

  return {
    verdict: "SUSPICIOUS",
    reason: `تم اكتشاف مؤشر غير معروف على الرابط. نوع المؤشر: ${details}.`
  };
}

export async function checkWithGoogleSafeBrowsing(urlToCheck: string): Promise<VerdictResult> {
  const apiKey = requireEnv("GOOGLE_SAFE_BROWSING_KEY");
  const endpoint = `${GOOGLE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    client: {
      clientId: "linkguard-bot",
      clientVersion: "1.0.0"
    },
    threatInfo: {
      threatTypes: [
        "MALWARE",
        "SOCIAL_ENGINEERING",
        "UNWANTED_SOFTWARE",
        "POTENTIALLY_HARMFUL_APPLICATION"
      ],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: [{ url: urlToCheck }]
    }
  };

  const data = await postWithRetry<GoogleSafeBrowsingResponse>(endpoint, requestBody);
  const matches = Array.isArray(data.matches) ? data.matches : [];

  if (matches.length === 0) {
    return {
      verdict: "SAFE",
      provider: providerDisplayNames.google,
      reason: "لم يتم العثور على تهديدات معروفة.",
      score: 0
    };
  }

  const threatTypes = [...new Set(matches.map((match) => String(match.threatType ?? "UNKNOWN")))];
  const mapped = mapGoogleThreatsToVerdict(threatTypes);

  return {
    verdict: mapped.verdict,
    provider: providerDisplayNames.google,
    reason: mapped.reason,
    score: matches.length
  };
}
