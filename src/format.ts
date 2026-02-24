import { verdictToArabicLabel } from "./verdict";
import type { VerdictResult } from "./verdict";

interface FormatVerdictInput {
  originalUrl: string;
  normalizedUrl: string;
  result: VerdictResult;
  fromCache?: boolean;
}

function stringifyRawProviderData(raw: unknown): string | null {
  if (raw === undefined) {
    return null;
  }

  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

export function formatVerdictMessage(input: FormatVerdictInput): string {
  const reason = input.fromCache
    ? `${input.result.reason} (نتيجة من الذاكرة المؤقتة)`
    : input.result.reason;

  const score = input.result.score === undefined || input.result.score === null
    ? "غير متاحة"
    : String(input.result.score);

  const lines = [
    `النتيجة: ${verdictToArabicLabel(input.result.verdict)}`,
    `الرابط الأصلي: ${input.originalUrl}`,
    `الرابط المعياري: ${input.normalizedUrl}`,
    `المزوّد: ${input.result.provider}`,
    `السبب: ${reason}`,
    `الدرجة: ${score}`
  ];

  const rawData = stringifyRawProviderData(input.result.providerRaw);
  if (rawData !== null) {
    lines.push("بيانات المزود (raw JSON):");
    lines.push(rawData);
  }

  return lines.join("\n");
}
