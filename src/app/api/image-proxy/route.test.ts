import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const cases: Array<[string, number, string]> = [
  ["http://127.0.0.1/x", 403, "loopback IPv4"],
  ["http://169.254.169.254/latest/meta-data/", 403, "cloud metadata"],
  ["http://10.0.0.1/x", 403, "private 10/8"],
  ["http://172.16.5.5/x", 403, "private 172.16/12"],
  ["http://192.168.1.1/x", 403, "private 192.168/16"],
  ["http://100.64.0.1/x", 403, "CGNAT 100.64/10"],
  ["http://[::1]/x", 403, "loopback IPv6"],
  ["http://[fe80::1]/x", 403, "link-local IPv6"],
  ["http://[fc00::1]/x", 403, "unique-local IPv6"],
  ["http://[::ffff:127.0.0.1]/x", 403, "IPv4-mapped loopback"],
  ["http://localhost/x", 403, "localhost -> 127.x"],
  ["ftp://example.com/x", 400, "bad scheme"],
  ["notaurl", 400, "not a url"],
  ["", 400, "empty"],
];

describe("image-proxy SSRF guard", () => {
  for (const [url, expected, label] of cases) {
    it(`${label}: ${JSON.stringify(url)} -> ${expected}`, async () => {
      const req = new NextRequest(
        `http://local/api/image-proxy?url=${encodeURIComponent(url)}`
      );
      const res = await GET(req);
      expect(res.status).toBe(expected);
    });
  }
});
