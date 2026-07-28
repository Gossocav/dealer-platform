import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = read("src/app/api/admin/demo-requests/route.ts");
const page = read("src/app/admin/demo-requests/page.tsx");

// Finora il link per impostare la password esisteva solo dentro l'email. Se
// quella non arriva -- e sul dominio in warm-up capita -- il concessionario
// resta bloccato e l'unico rimedio e' entrare nel database.
describe("access link reaches the admin panel", () => {
  it("returns the link right after activation", () => {
    expect(route).toMatch(/accessLink = passwordSetupLink;/);
    expect(route).toMatch(/linkedDealerId: normalizeText\(refreshedRequest\.data\?\.linked_dealer_id\),\s*\n\s*accessLink,/);
  });

  it("can regenerate it later without touching the request state", () => {
    expect(route).toContain('if (action === "access_link")');
    const branch = route.slice(route.indexOf('if (action === "access_link")'), route.indexOf('if (action === "mark_contacted" &&'));

    expect(branch).toContain('type: "recovery"');
    expect(branch).toMatch(/redirectTo: `\$\{resolveAppBaseUrl\(\)\}\/reset-password`/);
    // Nessuna scrittura di stato: e' una lettura, non un passaggio di ciclo.
    expect(branch).not.toMatch(/\.update\(/);
    expect(branch).not.toMatch(/actionToStatus/);
  });

  it("refuses to generate one for a demo that is not active", () => {
    expect(route).toMatch(/Il link si genera solo per una demo gia attivata/);
  });

  it("records the regeneration in the audit trail", () => {
    expect(route).toMatch(/action: "demo\.invitation_sent"/);
    expect(route).toMatch(/regenerated: true/);
  });

  it("is registered as a real action, not smuggled through", () => {
    expect(route).toMatch(/"download_document" \| "access_link"/);
    expect(route).toMatch(/"download_document", "access_link"\]\.includes\(action\)/);
  });
});

describe("the panel treats the link as a credential", () => {
  it("keeps it in memory only, never in storage", () => {
    expect(page).toMatch(/useState<\{ requestId: string; url: string \} \| null>\(null\)/);
    expect(page).not.toMatch(/localStorage[\s\S]{0,40}accessLink/);
    expect(page).not.toMatch(/sessionStorage[\s\S]{0,40}accessLink/);
  });

  it("shows it only for the request just handled", () => {
    expect(page).toMatch(/accessLink\?\.requestId === request\.id/);
  });

  it("warns what the link allows", () => {
    expect(page).toMatch(/puo&apos; \s*\n?\s*impostare la password|impostare la password di quell&apos;account/);
    expect(page).toMatch(/una volta sola e scade/);
  });

  it("offers the regenerate button only on an activated demo", () => {
    const gateAt = page.indexOf('status === "activated" ? (');
    expect(gateAt, "manca il controllo sullo stato").toBeGreaterThan(-1);

    const gated = page.slice(gateAt, page.indexOf(") : null}", gateAt));
    expect(gated).toContain("Link di accesso");
    expect(gated).toContain("regenerateAccessLink(request.id)");
  });

  it("copies with a fallback for browsers that block the clipboard", () => {
    expect(page).toContain("navigator.clipboard.writeText");
    expect(page).toContain('document.execCommand("copy")');
  });
});
