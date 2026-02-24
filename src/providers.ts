import { config, providerDisplayNames } from "./config";
import { checkWithGoogleSafeBrowsing } from "./googleSafeBrowsing";
import { checkWithVirusTotal } from "./virustotal";
import type { VerdictResult } from "./verdict";

export async function checkUrlWithActiveProvider(urlToCheck: string): Promise<VerdictResult> {
  if (config.activeProvider === "virustotal") {
    return checkWithVirusTotal(urlToCheck);
  }

  return checkWithGoogleSafeBrowsing(urlToCheck);
}

export function getConfiguredProviderName(): string {
  return providerDisplayNames[config.activeProvider];
}
