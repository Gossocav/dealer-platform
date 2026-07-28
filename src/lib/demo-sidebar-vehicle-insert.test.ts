import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_LIMITS, getDemoFeatureBlockReason, getDemoStatusSummary } from "@/lib/demo-access";

const sidebar = readFileSync(
  resolve(process.cwd(), "src/components/layout/dealer-sidebar.tsx"),
  "utf8",
);

function readItemList(name: string) {
  const match = sidebar.match(new RegExp(`const ${name}: SidebarItem\\[\\] = \\[([\\s\\S]*?)\\n\\];`));
  expect(match, `${name} non trovato in dealer-sidebar.tsx`).toBeTruthy();
  return [...(match?.[1] ?? "").matchAll(/label: "([^"]+)"/g)].map((entry) => entry[1]);
}

// La demo mostrava "Inserisci Veicolo" con il badge "Versione Completa" e un
// alert, mentre app e database le concedevano gia' 10 veicoli e la pagina
// Veicoli esponeva comunque il pulsante "Nuovo Veicolo". Il concessionario in
// prova concludeva che la demo fosse di sola lettura.
describe("menu laterale in demo", () => {
  it("mostra Inserisci Veicolo tra le voci utilizzabili", () => {
    expect(readItemList("demoEnabledItems")).toContain("Inserisci Veicolo");
  });

  it("non lo tiene tra le voci bloccate", () => {
    expect(readItemList("demoLockedItems")).not.toContain("Inserisci Veicolo");
  });

  it("resta coerente con il limite veicoli concesso alla demo", () => {
    // Se un giorno la demo non potesse piu' inserire veicoli, la voce di menu
    // andrebbe rimessa tra quelle bloccate: questo test lo segnala.
    expect(DEMO_LIMITS.vehicles).toBeGreaterThan(0);

    const context = getDemoStatusSummary({
      dealerId: "11111111-1111-1111-1111-111111111111",
      accountType: "demo",
      demoStatus: "active",
      demoExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      vehicleCount: 0,
    });

    expect(getDemoFeatureBlockReason(context, "vehicle")).toBeNull();
  });
});
