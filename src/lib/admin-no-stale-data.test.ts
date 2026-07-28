import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const ADMIN_PAGES = [
  "src/app/admin/page.tsx",
  "src/app/admin/dealers/page.tsx",
  "src/app/admin/dealer-approval/page.tsx",
  "src/app/admin/demo-requests/page.tsx",
  "src/app/admin/info-requests/page.tsx",
];

const ADMIN_ROUTES = [
  "src/app/api/admin/overview/route.ts",
  "src/app/api/admin/dealers/route.ts",
  "src/app/api/admin/demo-requests/route.ts",
  "src/app/api/admin/info-requests/route.ts",
  "src/app/api/admin/dealer-approval/route.ts",
];

function getFetchBlocks(source: string) {
  return source.match(/fetch\("\/api\/admin[^"]*",\s*\{[\s\S]*?\n\s*\}\)/g) ?? [];
}

// The admin panel reports live operational state: how many dealers are
// approved, which demo requests are waiting, how many accounts exist. A reply
// replayed from cache shows none of that as stale -- it just shows a wrong
// number, which is how a deleted account kept being counted.
describe("admin panel never serves stale data", () => {
  it.each(ADMIN_ROUTES)("%s opts out of caching", (path) => {
    expect(read(path)).toContain('export const dynamic = "force-dynamic";');
  });

  it.each(ADMIN_PAGES)("%s requests fresh data on every GET", (path) => {
    const gets = getFetchBlocks(read(path)).filter((block) => block.includes('method: "GET"'));

    expect(gets.length, `${path} has no admin GET to check`).toBeGreaterThan(0);
    for (const block of gets) {
      expect(block, `a GET in ${path} may be answered from cache`).toContain('cache: "no-store"');
    }
  });

  it("leaves writes alone, since a POST is never served from cache", () => {
    const writes = ADMIN_PAGES.flatMap((path) =>
      getFetchBlocks(read(path)).filter((block) => /method: "(POST|PUT|PATCH|DELETE)"/.test(block)),
    );

    expect(writes.length).toBeGreaterThan(0);
    for (const block of writes) {
      expect(block).not.toContain('cache: "no-store"');
    }
  });
});
