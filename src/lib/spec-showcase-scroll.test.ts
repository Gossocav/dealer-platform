import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const showcase = readFileSync(
  resolve(process.cwd(), "src/components/marketplace/spec-showcase.tsx"),
  "utf8",
);

// Pinning this section froze the page mid-scroll for visitors: a pinned
// element cannot move in the viewport, so the view() timeline driving the
// spec rows finished before the pin began and every pinned pixel afterwards
// revealed nothing. This guards the pattern, not a styling preference.
describe("spec showcase scrolling", () => {
  it("does not pin the section while scrolling", () => {
    const classNames = [...showcase.matchAll(/className="([^"]*)"/g)].map((match) => match[1]);

    for (const className of classNames) {
      expect(className, `"${className}" reintroduces sticky pinning`).not.toMatch(/\bsticky\b/);
      expect(className, `"${className}" reintroduces a fixed overlay`).not.toMatch(/\bfixed\b/);
    }
  });

  it("does not stretch the section to viewport heights", () => {
    // A tall section exists only to give a pinned child somewhere to stick.
    // Without the pin it is dead scroll on its own.
    const classNames = [...showcase.matchAll(/className="([^"]*)"/g)].map((match) => match[1]);

    for (const className of classNames) {
      expect(className, `"${className}" reintroduces viewport-height padding`).not.toMatch(
        /min-h-\[\d+vh\]/,
      );
    }
  });

  it("keeps the row reveal that the section is built around", () => {
    // Removing the pin must not cost the animation: the rows still animate
    // through .spec-row plus the is-ready progressive-enhancement flag.
    expect(showcase).toContain("spec-row");
    expect(showcase).toContain("is-ready");
  });
});
