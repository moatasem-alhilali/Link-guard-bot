import { verdictToArabicLabel } from "./verdict";
import type { VerdictResult } from "./verdict";

interface FormatVerdictInput {
  originalUrl: string;
  normalizedUrl: string;
  result: VerdictResult;
  fromCache?: boolean;
}

export function formatVerdictMessage(input: FormatVerdictInput): string {
  const reason = input.fromCache
    ? `${input.result.reason} (نتيجة من الذاكرة المؤقتة)`
    : input.result.reason;

  const score = input.result.score === undefined || input.result.score === null
    ? "غير متاحة"
    : String(input.result.score);

  return [
    `النتيجة: ${verdictToArabicLabel(input.result.verdict)}`,
    `الرابط الأصلي: ${input.originalUrl}`,
    `الرابط المعياري: ${input.normalizedUrl}`,
    `المزوّد: ${input.result.provider}`,
    `السبب: ${reason}`,
    `الدرجة: ${score}`
  ].join("\n");
}
