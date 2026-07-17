import { describe, expect, it } from "vitest";
import { createClientPortalToken, extractPublicNotes, verifyClientPortalToken } from "@/lib/client-portal";

describe("client portal helpers", () => {
  it("extracts only notes marked as public", () => {
    const notes = extractPublicNotes(`
      nota interna
      [PUBBLICA] Confermato documento d'identita.
      [PUBLIC] Veicolo disponibile per test drive.
      [PUBBLICO] Appuntamento fissato per venerdi.
    `);

    expect(notes).toEqual([
      "Confermato documento d'identita.",
      "Veicolo disponibile per test drive.",
      "Appuntamento fissato per venerdi.",
    ]);
  });

  it("creates and verifies deterministic token", () => {
    const token = createClientPortalToken({
      leadId: "lead-1",
      email: "cliente@example.com",
      secret: "test-secret",
    });

    expect(
      verifyClientPortalToken({
        leadId: "lead-1",
        email: "cliente@example.com",
        token,
        secret: "test-secret",
      })
    ).toBe(true);

    expect(
      verifyClientPortalToken({
        leadId: "lead-1",
        email: "cliente@example.com",
        token,
        secret: "wrong-secret",
      })
    ).toBe(false);
  });
});
