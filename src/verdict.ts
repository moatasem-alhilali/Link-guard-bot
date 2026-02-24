export type Verdict = "SAFE" | "SUSPICIOUS" | "MALICIOUS" | "UNKNOWN";

export interface VerdictResult {
  verdict: Verdict;
  provider: string;
  reason: string;
  score?: string | number;
  providerRaw?: unknown;
}

const VERDICT_LABELS_AR: Record<Verdict, string> = {
  SAFE: "✅ آمن",
  SUSPICIOUS: "⚠️ مشبوه",
  MALICIOUS: "🚫 خبيث",
  UNKNOWN: "❓ غير معروف"
};

export function verdictToArabicLabel(verdict: Verdict): string {
  return VERDICT_LABELS_AR[verdict];
}
