import axios from "axios";
import { config, providerDisplayNames, requireEnv } from "./config";
import type { VerdictResult } from "./verdict";

interface VirusTotalSubmitResponse {
  data?: {
    id?: string;
  };
}

interface VirusTotalAnalysisResponse {
  data?: {
    attributes?: {
      status?: string;
      stats?: Record<string, number>;
    };
  };
}

const VIRUSTOTAL_BASE_URL = "https://www.virustotal.com/api/v3";

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

async function runWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  const maxAttempts = config.maxRetries + 1;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      if (attempt >= maxAttempts || !isTransientError(error)) {
        throw error;
      }
      await sleep(350 * attempt);
    }
  }

  throw new Error("VirusTotal request failed after retries");
}

export async function checkWithVirusTotal(urlToCheck: string): Promise<VerdictResult> {
  const apiKey = requireEnv("VIRUSTOTAL_API_KEY");
  const headers = { "x-apikey": apiKey };

  const submitData = await runWithRetry(async () => {
    const response = await axios.post<VirusTotalSubmitResponse>(
      `${VIRUSTOTAL_BASE_URL}/urls`,
      new URLSearchParams({ url: urlToCheck }).toString(),
      {
        timeout: config.requestTimeoutMs,
        headers: {
          ...headers,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );
    return response.data;
  });

  const analysisId = submitData.data?.id;
  if (!analysisId) {
    return {
      verdict: "UNKNOWN",
      provider: providerDisplayNames.virustotal,
      reason: "تعذر الحصول على معرف التحليل من VirusTotal."
    };
  }

  const fetchAnalysis = async (): Promise<VirusTotalAnalysisResponse> => {
    const response = await axios.get<VirusTotalAnalysisResponse>(
      `${VIRUSTOTAL_BASE_URL}/analyses/${encodeURIComponent(analysisId)}`,
      {
        timeout: config.requestTimeoutMs,
        headers
      }
    );
    return response.data;
  };

  let analysisData = await runWithRetry(fetchAnalysis);
  if (analysisData.data?.attributes?.status !== "completed") {
    await sleep(1_000);
    analysisData = await runWithRetry(fetchAnalysis);
  }

  const stats = analysisData.data?.attributes?.stats;
  if (!stats) {
    return {
      verdict: "UNKNOWN",
      provider: providerDisplayNames.virustotal,
      reason: "التحليل غير مكتمل أو لا يحتوي على نتائج كافية."
    };
  }

  const malicious = Number(stats.malicious ?? 0);
  const suspicious = Number(stats.suspicious ?? 0);
  const harmless = Number(stats.harmless ?? 0);
  const undetected = Number(stats.undetected ?? 0);
  const timeout = Number(stats.timeout ?? 0);
  const total = malicious + suspicious + harmless + undetected + timeout;

  if (malicious > 0) {
    return {
      verdict: "MALICIOUS",
      provider: providerDisplayNames.virustotal,
      reason: "رُصد الرابط كخبيث بواسطة بعض المحركات.",
      score: `${malicious}/${total || 1}`
    };
  }

  if (suspicious > 0) {
    return {
      verdict: "SUSPICIOUS",
      provider: providerDisplayNames.virustotal,
      reason: "رُصد الرابط كمشبوه بواسطة بعض المحركات.",
      score: `${suspicious}/${total || 1}`
    };
  }

  return {
    verdict: "SAFE",
    provider: providerDisplayNames.virustotal,
    reason: "لم يتم رصد مؤشرات خطر في التحليل.",
    score: `${malicious + suspicious}/${total || 1}`
  };
}
