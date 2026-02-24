import { verdictToArabicLabel } from "./verdict";
import type { VerdictResult } from "./verdict";

interface FormatVerdictInput {
  originalUrl: string;
  normalizedUrl: string;
  result: VerdictResult;
  fromCache?: boolean;
}

function getUserAdvice(verdict: VerdictResult["verdict"]): string {
  if (verdict === "SAFE") {
    return "يمكنك المتابعة بحذر، وتأكد دائمًا من مصدر الرابط.";
  }

  if (verdict === "SUSPICIOUS") {
    return "لا تدخل أي بيانات شخصية أو مالية قبل التحقق من الجهة المرسلة.";
  }

  if (verdict === "MALICIOUS") {
    return "تجنب فتح الرابط فورًا واحذفه، لأنه قد يسبب ضررًا لحسابك أو جهازك.";
  }

  return "تعامل مع الرابط بحذر شديد وحاول التحقق منه لاحقًا.";
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
    `ملخص الفحص: ${reason}`,
    `الرابط الأصلي: ${input.originalUrl}`,
    `الرابط المعياري: ${input.normalizedUrl}`,
    `المزوّد: ${input.result.provider}`,
    `درجة الخطورة: ${score}`,
    `النصيحة: ${getUserAdvice(input.result.verdict)}`
  ].join("\n");
}
