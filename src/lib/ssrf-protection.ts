import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export function parseAndValidateExternalHttpUrl(rawValue: string | URL): URL {
  const parsedUrl = rawValue instanceof URL ? new URL(rawValue.toString()) : new URL(String(rawValue ?? "").trim());

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTP/HTTPS URLs are allowed.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("URL userinfo is not allowed.");
  }

  if (isBlockedHost(parsedUrl.hostname)) {
    throw new Error("Blocked host.");
  }

  return parsedUrl;
}

export async function fetchWithSsrfProtection(
  input: string | URL,
  init: RequestInit & { maxRedirects?: number } = {}
) {
  const { maxRedirects = 5, ...fetchInit } = init;

  let currentUrl = parseAndValidateExternalHttpUrl(input);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl.toString(), {
      ...fetchInit,
      redirect: "manual",
    });

    if (!REDIRECT_STATUS_CODES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Redirect without location header.");
    }

    currentUrl = parseAndValidateExternalHttpUrl(new URL(location, currentUrl));
  }

  throw new Error("Too many redirects.");
}

function isBlockedHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;

  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }

  if (ipVersion === 6) {
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }

  return false;
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map((chunk) => Number(chunk));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return true;
  }

  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}