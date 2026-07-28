import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = read("src/app/api/admin/overview/route.ts");
const page = read("src/app/admin/page.tsx");

// A demo request is a prospective customer. Before these tiles the dashboard
// gave no sign one had arrived: the six counters covered dealers, vehicles,
// leads and accounts, so a request could sit unread for days.
describe("dashboard surfaces incoming requests", () => {
  it("counts demo requests still open, not every request ever made", () => {
    // "contacted" means the admin wrote back, not that the request is closed;
    // "activated" and "rejected" are the two states that resolve it.
    expect(route).toMatch(/DEMO_REQUEST_OPEN_STATUSES = \["pending", "contacted"\]/);
    expect(route).toMatch(/from\("demo_requests"\)[\s\S]{0,160}\.in\("status", DEMO_REQUEST_OPEN_STATUSES\)/);
  });

  it("counts info requests", () => {
    expect(route).toMatch(/from\("dealer_info_requests"\)/);
    expect(route).toMatch(/infoRequestsReceived: extractCount\(/);
  });

  it("keeps the fallback payload in step with the stats shape", () => {
    // The 500 branch returns its own literal: a missing key there would crash
    // the page exactly when something is already wrong.
    const fallback = route.slice(route.lastIndexOf("status: 500"));
    expect(route).toMatch(/demoRequestsToHandle: 0,/);
    expect(route).toMatch(/infoRequestsReceived: 0,/);
    expect(fallback.length).toBeGreaterThan(0);
  });

  it("shows the actionable tile first", () => {
    const demoAt = page.indexOf('label: "Richieste demo da gestire"');
    const dealersAt = page.indexOf('label: "Concessionarie registrate"');

    expect(demoAt).toBeGreaterThan(-1);
    expect(demoAt).toBeLessThan(dealersAt);
  });

  it("shows the info requests tile", () => {
    expect(page).toContain('label: "Richieste informazioni"');
  });

  it("reads both new counters defensively, like the existing ones", () => {
    expect(page).toMatch(/demoRequestsToHandle: toSafeNumber\(stats\.demoRequestsToHandle\)/);
    expect(page).toMatch(/infoRequestsReceived: toSafeNumber\(stats\.infoRequestsReceived\)/);
  });
});
