import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { esitoTelaio, INDICE_TELAIO_ATTIVO, messaggioTelaio, messaggioTelaioDoppio, telaioDaSalvare, telaioValido } from "@/lib/telaio";

/**
 * Il difetto che questi test impediscono, visto in produzione il 16/09/2026:
 * due auto della stessa concessionaria -- una Nissan Micra e una Jeep
 * Avenger -- con lo stesso telaio, `12345`. Un segnaposto scritto in archivio
 * come se fosse un telaio, che il feed avrebbe preso per "la stessa auto".
 */
describe("la forma di un telaio", () => {
  it("accetta un telaio vero, in qualunque modo sia scritto", () => {
    expect(esitoTelaio("ZFA31200003123456")).toEqual({ stato: "valido", telaio: "ZFA31200003123456" });
    expect(esitoTelaio("zfa 3120000 3123456")).toEqual({ stato: "valido", telaio: "ZFA31200003123456" });
    expect(telaioDaSalvare("WVWZZZ1KZ8W123456")).toBe("WVWZZZ1KZ8W123456");
  });

  it("il segnaposto di Autogepy non passa, e dice perche'", () => {
    expect(esitoTelaio("12345")).toEqual({ stato: "non-valido", telaio: "12345", motivo: "un telaio ha 17 caratteri, questo ne ha 5" });
    expect(messaggioTelaio("12345")).toBe('"12345" non sembra un numero di telaio: un telaio ha 17 caratteri, questo ne ha 5.');
    expect(telaioDaSalvare("12345")).toBeNull();
  });

  it("le lettere I, O e Q non esistono nei telai", () => {
    expect(esitoTelaio("ZFA3120000312345O")).toMatchObject({ stato: "non-valido", motivo: "un telaio non usa le lettere I, O e Q" });
  });

  it("diciassette caratteri uguali sono un altro segnaposto", () => {
    expect(telaioValido("00000000000000000")).toBe(false);
    expect(telaioValido("XXXXXXXXXXXXXXXXX")).toBe(false);
  });

  it("vuoto non e' un errore", () => {
    expect(esitoTelaio("")).toEqual({ stato: "vuoto" });
    expect(esitoTelaio(null)).toEqual({ stato: "vuoto" });
    expect(messaggioTelaio("  ")).toBeNull();
    expect(telaioDaSalvare(undefined)).toBeNull();
  });
});

describe("il telaio ha una casa sola", () => {
  it("il lettore del blocco dei siti e la scheda usano questa forma, non una loro", () => {
    const lettore = readFileSync(resolve(process.cwd(), "src/lib/blocco-motork.ts"), "utf8");
    expect(lettore).toContain("telaioDaSalvare(");
    expect(lettore, "il lettore ha ancora una forma scritta dentro di se'").not.toMatch(/\[A-HJ-NPR-Z0-9\]\{17\}/);
    const scheda = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicle-editor-page.tsx"), "utf8");
    expect(scheda).toContain("telaioDaSalvare(state.vin)");
    expect(scheda).toContain("messaggioTelaio(state.vin)");
    const chiusura = readFileSync(resolve(process.cwd(), "src/components/vehicles/vehicles-to-close-page.tsx"), "utf8");
    expect(chiusura).toContain("telaioDaSalvare(");
  });
});

describe("il telaio doppio si spiega, non si mostra come errore tecnico", () => {
  it("traduce il rifiuto del database e lascia stare gli altri", () => {
    expect(messaggioTelaioDoppio({ code: "23505", message: `duplicate key value violates unique constraint "${INDICE_TELAIO_ATTIVO}"` })).toContain("numero di telaio");
    expect(messaggioTelaioDoppio({ code: "23505", message: 'duplicate key value violates unique constraint "altro"' })).toBeNull();
    expect(messaggioTelaioDoppio(null)).toBeNull();
  });

  it("il nome dell'indice e' quello scritto nella migration", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260916020000_un_telaio_attivo_per_concessionaria.sql"), "utf8");
    expect(migration).toContain(`create unique index if not exists ${INDICE_TELAIO_ATTIVO}`);
    expect(migration).toContain("where vin is not null and status not in ('sold', 'archived')");
  });
});
