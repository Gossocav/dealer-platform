import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("proxy security headers", () => {
  const response = proxy(new NextRequest("https://local/dashboard"));

  it("sets a Content-Security-Policy with frame-ancestors 'none'", () => {
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("sets the standard hardening headers", () => {
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
  });
});
