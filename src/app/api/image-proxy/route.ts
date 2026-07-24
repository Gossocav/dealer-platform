import { NextRequest, NextResponse } from "next/server";
import * as dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";

export const runtime = "nodejs";

const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const FETCH_TIMEOUT_MS = 10_000;

// Blocked IPv4 CIDR ranges: loopback, private networks, link-local (includes
// the cloud metadata endpoint 169.254.169.254), CGNAT, and test/reserved/
// multicast space. This stops the proxy from being abused to reach internal
// infrastructure (SSRF) while still allowing arbitrary *public* image hosts,
// which the vehicle feeds legitimately use.
const BLOCKED_IPV4_CIDRS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

class ProxyError extends Error {
  status: number;
  publicMessage: string;

  constructor(status: number, publicMessage: string) {
    super(publicMessage);
    this.name = "ProxyError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

function ipv4ToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let long = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    long = (long << 8) + octet;
  }

  return long >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  if (long === null) return true; // Unparseable -> fail closed.

  for (const [base, bits] of BLOCKED_IPV4_CIDRS) {
    const baseLong = ipv4ToLong(base);
    if (baseLong === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((long & mask) === (baseLong & mask)) return true;
  }

  return false;
}

function parseIPv6(input: string): number[] | null {
  let text = input;

  const zoneIndex = text.indexOf("%");
  if (zoneIndex !== -1) text = text.slice(0, zoneIndex);

  // Convert an embedded IPv4 tail (e.g. ::ffff:127.0.0.1) into two hex groups.
  const dotIndex = text.indexOf(".");
  if (dotIndex !== -1) {
    const lastColon = text.lastIndexOf(":", dotIndex);
    if (lastColon === -1) return null;
    const embedded = ipv4ToLong(text.slice(lastColon + 1));
    if (embedded === null) return null;
    const hi = ((embedded >>> 16) & 0xffff).toString(16);
    const lo = (embedded & 0xffff).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const parseGroups = (segment: string): number[] | null => {
    if (segment === "") return [];
    const groups: number[] = [];
    for (const group of segment.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      groups.push(parseInt(group, 16));
    }
    return groups;
  };

  const head = parseGroups(halves[0]);
  if (head === null) return null;

  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }

  const tail = parseGroups(halves[1]);
  if (tail === null) return null;

  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;

  return [...head, ...new Array(missing).fill(0), ...tail];
}

function isBlockedIPv6(ip: string): boolean {
  const groups = parseIPv6(ip);
  if (!groups) return true; // Unparseable -> fail closed.

  // IPv4-mapped (::ffff:a.b.c.d) -> validate the embedded IPv4 address.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const embedded = `${(groups[6] >> 8) & 0xff}.${groups[6] & 0xff}.${(groups[7] >> 8) & 0xff}.${groups[7] & 0xff}`;
    return isBlockedIPv4(embedded);
  }

  // :: (unspecified) and ::1 (loopback).
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;

  // fe80::/10 link-local.
  if ((groups[0] & 0xffc0) === 0xfe80) return true;

  // fc00::/7 unique-local.
  if ((groups[0] & 0xfe00) === 0xfc00) return true;

  return false;
}

// Resolves the hostname and rejects the request if any resolved address points
// at private/internal space. An IP literal resolves to itself, so literals are
// covered by the same path.
async function assertPublicHost(hostname: string): Promise<void> {
  // URL.hostname wraps IPv6 literals in brackets (e.g. "[::1]"); strip them so
  // both the DNS lookup and the IPv6 range check see the bare address.
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "");

  let results: LookupAddress[];
  try {
    results = await dns.lookup(host, { all: true });
  } catch {
    throw new ProxyError(400, "Host non risolvibile");
  }

  if (results.length === 0) {
    throw new ProxyError(400, "Host non risolvibile");
  }

  for (const { address, family } of results) {
    const blocked = family === 6 ? isBlockedIPv6(address) : isBlockedIPv4(address);
    if (blocked) {
      throw new ProxyError(403, "Host non consentito");
    }
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.byteLength > maxBytes ? null : buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim() ?? "";

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return new NextResponse("Invalid image url", { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new NextResponse("Invalid image url", { status: 400 });
  }

  try {
    let currentUrl = target;
    let response: Response | null = null;

    // Follow redirects manually so each hop's host is re-validated: a public
    // URL that 3xx-redirects to an internal address cannot bypass the check.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertPublicHost(currentUrl.hostname);

      const hopResponse = await fetch(currentUrl, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DealerPlatform/1.0)",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      if (hopResponse.status >= 300 && hopResponse.status < 400) {
        const location = hopResponse.headers.get("location");
        await hopResponse.body?.cancel().catch(() => {});

        if (!location) {
          return new NextResponse("Image fetch failed", { status: 404 });
        }

        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return new NextResponse("Image fetch failed", { status: 404 });
        }

        if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
          return new NextResponse("Invalid redirect", { status: 400 });
        }

        currentUrl = nextUrl;
        continue;
      }

      response = hopResponse;
      break;
    }

    if (!response) {
      return new NextResponse("Too many redirects", { status: 502 });
    }

    if (!response.ok) {
      return new NextResponse("Image fetch failed", { status: 404 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";

    if (!contentType.toLowerCase().startsWith("image/")) {
      await response.body?.cancel().catch(() => {});
      return new NextResponse("Invalid content type", { status: 415 });
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      await response.body?.cancel().catch(() => {});
      return new NextResponse("Image too large", { status: 413 });
    }

    const buffer = await readCapped(response, MAX_IMAGE_BYTES);
    if (!buffer) {
      return new NextResponse("Image too large", { status: 413 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (error) {
    if (error instanceof ProxyError) {
      return new NextResponse(error.publicMessage, { status: error.status });
    }

    return new NextResponse("Proxy error", { status: 500 });
  }
}
