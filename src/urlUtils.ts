import dns from "node:dns/promises";
import net from "node:net";
import { URL, domainToASCII } from "node:url";
import { config } from "./config";

const FIRST_URL_REGEX = /https?:\/\/[^\s<>"'`]+/i;
const TRAILING_PUNCTUATION = ".,!?;:)]}\"'";

export interface NormalizeUrlResult {
  valid: boolean;
  normalizedUrl?: string;
  blockReason?: string;
  error?: string;
}

function stripTrailingPunctuation(value: string): string {
  let current = value.trim();
  while (current.length > 0 && TRAILING_PUNCTUATION.includes(current[current.length - 1])) {
    current = current.slice(0, -1);
  }
  return current;
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return octets;
}

function blockReasonForIp(ip: string): string | null {
  const version = net.isIP(ip);
  if (version === 4) {
    if (ip === "169.254.169.254") {
      return "الرابط يشير إلى عنوان metadata محظور.";
    }

    const octets = parseIpv4(ip);
    if (!octets) {
      return null;
    }

    const [a, b] = octets;
    if (a === 127) {
      return "الرابط يشير إلى عنوان localhost/loopback غير مسموح.";
    }
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return "الرابط يشير إلى عنوان داخلي (Private IP) غير مسموح.";
    }
    if (a === 169 && b === 254) {
      return "الرابط يشير إلى عنوان link-local غير مسموح.";
    }
    return null;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") {
      return "الرابط يشير إلى عنوان loopback غير مسموح.";
    }
    if (normalized.startsWith("fe80:")) {
      return "الرابط يشير إلى عنوان link-local IPv6 غير مسموح.";
    }
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return "الرابط يشير إلى عنوان IPv6 داخلي غير مسموح.";
    }
    return null;
  }

  return null;
}

function blockReasonForHost(hostname: string): string | null {
  const host = stripIpv6Brackets(hostname.toLowerCase());

  if (host === "localhost" || host.endsWith(".localhost")) {
    return "الرابط يشير إلى localhost وهو غير مسموح.";
  }

  const directIpReason = blockReasonForIp(host);
  if (directIpReason) {
    return directIpReason;
  }

  return null;
}

async function resolveAddressesBestEffort(hostname: string): Promise<string[]> {
  const timeoutMs = 1_500;
  let timer: NodeJS.Timeout | null = null;

  try {
    const lookupPromise = dns.lookup(hostname, { all: true, verbatim: true });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("DNS lookup timeout")), timeoutMs);
    });

    const records = (await Promise.race([lookupPromise, timeoutPromise])) as Array<{
      address: string;
      family: number;
    }>;

    return records.map((record) => record.address);
  } catch {
    return [];
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(FIRST_URL_REGEX);
  if (!match?.[0]) {
    return null;
  }

  const cleaned = stripTrailingPunctuation(match[0]);
  if (!cleaned) {
    return null;
  }

  return cleaned;
}

export async function normalizeAndValidateUrl(rawUrl: string): Promise<NormalizeUrlResult> {
  const candidate = rawUrl.trim();
  if (!candidate) {
    return { valid: false, error: "Empty URL" };
  }

  if (candidate.length > config.maxUrlLength) {
    return { valid: false, error: "URL too long" };
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Protocol must be http or https" };
  }

  const hostWithoutBrackets = stripIpv6Brackets(parsed.hostname);
  const ipVersion = net.isIP(hostWithoutBrackets);

  let normalizedHost = hostWithoutBrackets;
  if (ipVersion === 0) {
    normalizedHost = domainToASCII(hostWithoutBrackets);
    if (!normalizedHost) {
      return { valid: false, error: "Invalid hostname" };
    }
  }

  parsed.hostname = normalizedHost.toLowerCase();
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hash = "";

  if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
    parsed.port = "";
  }

  const normalizedUrl = parsed.toString();
  if (normalizedUrl.length > config.maxUrlLength) {
    return { valid: false, error: "Normalized URL too long", normalizedUrl };
  }

  const directReason = blockReasonForHost(parsed.hostname);
  if (directReason) {
    return {
      valid: false,
      normalizedUrl,
      blockReason: directReason
    };
  }

  if (ipVersion === 0) {
    const addresses = await resolveAddressesBestEffort(parsed.hostname);
    for (const address of addresses) {
      const reason = blockReasonForIp(stripIpv6Brackets(address));
      if (reason) {
        return {
          valid: false,
          normalizedUrl,
          blockReason: `${reason} (Resolved: ${address})`
        };
      }
    }
  }

  return {
    valid: true,
    normalizedUrl
  };
}
