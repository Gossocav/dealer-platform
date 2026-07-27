import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const showcase = read("src/components/marketplace/spec-showcase.tsx");
const homepage = read("src/app/(marketplace)/page.tsx");

// The showcase falls back to an ordinary vehicle whenever no Elite dealer has
// a usable one. Showing "Spazio Elite" over that vehicle would tell visitors
// something untrue and would misrepresent what the plan buys, so these tests
// guard the condition rather than the styling.
//
// There is no React testing tooling in this project (no testing-library, no
// jsdom), so this asserts on the source. It cannot prove what renders; it can
// prove the badge is not unconditional, which is the regression that matters.
describe("Spazio Elite badge", () => {
  it("renders only when the Elite rotation picked the vehicle", () => {
    expect(showcase).toMatch(/\{vehicle\.isElite \? \(/);
    expect(showcase).toContain("Spazio Elite");
  });

  it("keeps the badge inside the conditional", () => {
    const conditional = showcase.slice(
      showcase.indexOf("{vehicle.isElite ? ("),
      showcase.indexOf("            ) : null}"),
    );

    expect(conditional).toContain("Spazio Elite");
  });

  it("carries an isElite flag on the showcase type", () => {
    expect(showcase).toMatch(/isElite: boolean;/);
  });

  it("derives the flag from the Elite lookup, never hardcoding it", () => {
    expect(homepage).toContain("eliteShowcase !== null");
    expect(homepage).not.toMatch(/isElite:\s*true/);
    expect(homepage).not.toMatch(/buildShowcaseVehicle\([^)]*,\s*true\s*\)/);
  });

  it("passes the flag through the builder rather than recomputing it", () => {
    expect(homepage).toMatch(/buildShowcaseVehicle\(\s*\n?\s*vehicle: MarketplaceVehicle \| null,\s*\n?\s*isElite: boolean,/s);
    expect(homepage).toMatch(/^\s*isElite,$/m);
  });
});
