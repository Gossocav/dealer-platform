import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COLONNA_RICERCA, modelloIlike, paroleRicercaVeicolo } from "./ricerca-veicoli";

/**
 * La ricerca veicoli.
 *
 * **Quale difetto impedisce.** Misurato sulla produzione il 06/09/2026:
 *
 *     Veicoli pubblicati:          296
 *     Con marca accentata:          36    (Citroen 35, Skoda 1)
 *
 *     chi cerca "citroen"     trovava   1   invece di 35
 *     chi cerca "skoda"       trovava   0   invece di 1
 *     chi cerca "citroen c3"  trovava   0   anche scrivendo l'accento
 *
 * Il 12% del parco non si faceva trovare da chi lo cercava per nome. Non e'
 * un problema di sicurezza: e' il difetto che faceva perdere clienti veri,
 * tutti i giorni.
 */

describe("le parole si normalizzano come le normalizza il database", () => {
  it("gli accenti spariscono: e' il difetto che nascondeva 35 Citroen su 296", () => {
    expect(paroleRicercaVeicolo("Citroën")).toEqual(["citroen"]);
    expect(paroleRicercaVeicolo("citroën")).toEqual(["citroen"]);
    expect(paroleRicercaVeicolo("Škoda")).toEqual(["skoda"]);
  });

  it("chi scrive senza accento trova comunque, che e' il caso normale", () => {
    // Praticamente nessuno scrive la dieresi. Il database salva "citroen"
    // nella colonna generata, e qui si arriva alla stessa parola.
    expect(paroleRicercaVeicolo("CITROEN")).toEqual(["citroen"]);
  });

  it("piu' parole diventano piu' condizioni: 'citroen c3' non era possibile prima", () => {
    // Prima si cercava la frase intera dentro una colonna sola, e nessuna
    // colonna contiene sia la marca sia il modello: dava sempre zero.
    expect(paroleRicercaVeicolo("citroen c3")).toEqual(["citroen", "c3"]);
    expect(paroleRicercaVeicolo("c3 citroen")).toEqual(["c3", "citroen"]);
  });

  it("il percento non cambia di nascosto cosa si cerca", () => {
    // E' il jolly di ilike: "a%i" cercherebbe tutt'altro rispetto a quello
    // che chi cerca crede di aver scritto.
    expect(paroleRicercaVeicolo("audi%")).toEqual(["audi"]);
    expect(paroleRicercaVeicolo("%")).toEqual([]);
  });

  it("la virgola separa invece di rompere", () => {
    // Prima una virgola spezzava la riga del filtro e il database rispondeva
    // 400: la ricerca del gestionale non dava niente e non diceva perche'.
    expect(paroleRicercaVeicolo("audi,a3")).toEqual(["audi", "a3"]);
  });

  it("una ricerca vuota non filtra niente, invece di filtrare per stringa vuota", () => {
    // Il difetto da evitare: `%%` fa passare tutto e sembra una ricerca
    // riuscita.
    for (const vuoto of ["", "   ", ",", "%", " , % ", null, undefined]) {
      expect(paroleRicercaVeicolo(vuoto), `${JSON.stringify(vuoto)} avrebbe filtrato`).toEqual([]);
    }
  });

  it("i punti e le parentesi restano: '1.6 hdi' si scrive davvero", () => {
    expect(paroleRicercaVeicolo("1.6 hdi")).toEqual(["1.6", "hdi"]);
    expect(paroleRicercaVeicolo("c4 (2019)")).toEqual(["c4", "(2019)"]);
  });

  it("l'indicatore ordinale resta com'e', su tutti e due i lati", () => {
    // Misurato: in produzione "1a serie" compare 3 volte, e ne' NFD ne'
    // unaccent lo toccano. Se un giorno uno dei due cambiasse idea, i due
    // lati divergerebbero e la ricerca smetterebbe di trovare quelle righe.
    expect(paroleRicercaVeicolo("1ª serie")).toEqual(["1ª", "serie"]);
  });

  it("una ricerca lunghissima non diventa cinquanta condizioni", () => {
    const tante = Array.from({ length: 40 }, (_, i) => `p${i}`).join(" ");
    expect(paroleRicercaVeicolo(tante).length).toBe(6);
  });

  it("il modello per ilike circonda la parola", () => {
    expect(modelloIlike("citroen")).toBe("%citroen%");
  });
});

describe("la copia doppia non puo' rinascere", () => {
  /**
   * Il difetto non era il singolo carattere: era che la stessa riga stesse
   * scritta in due posti, la vetrina e il gestionale, e che le due copie
   * fossero gia' divergenti. Finche' resta in due posti, un giorno divergono
   * di nuovo.
   */
  it("nessuna pagina si ricostruisce il filtro a mano", () => {
    for (const percorso of [
      "src/components/vehicles/vehicles-management-page.tsx",
      "src/app/(marketplace)/ricerca/page.tsx",
    ]) {
      const codice = readFileSync(resolve(process.cwd(), percorso), "utf8");

      expect(codice, `${percorso} si riscrive il filtro invece di usare paroleRicercaVeicolo`).not.toMatch(
        /brand\.ilike\.%\$\{/
      );
      expect(codice, `${percorso} non usa il filtro comune`).toContain("paroleRicercaVeicolo");
    }
  });

  it("la colonna e' nominata in un posto solo", () => {
    expect(COLONNA_RICERCA).toBe("ricerca_testo");

    for (const percorso of [
      "src/components/vehicles/vehicles-management-page.tsx",
      "src/app/(marketplace)/ricerca/page.tsx",
    ]) {
      const codice = readFileSync(resolve(process.cwd(), percorso), "utf8");
      expect(codice, `${percorso} scrive il nome della colonna a mano`).not.toMatch(/"ricerca_testo"/);
    }
  });
});

describe("la migration che regge tutto questo", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260906160000_ricerca_senza_accenti.sql"),
    "utf8"
  );

  it("la colonna si riempie da sola e non si puo' scriverci sopra", () => {
    expect(sql).toContain("generated always as");
    expect(sql).toContain("stored");
  });

  it("c'e' l'indice, altrimenti ogni ricerca legge tutto il parco", () => {
    expect(sql).toContain("gin (ricerca_testo gin_trgm_ops)");
  });

  it("la vetrina pubblica puo' filtrarci sopra", () => {
    // Senza questo permesso la ricerca risponderebbe errore a ogni
    // visitatore: su vehicles il pubblico ha permessi colonna per colonna.
    const elenco = sql.slice(sql.indexOf("grant select ("), sql.indexOf(") on public.vehicles to anon"));
    expect(elenco, "ricerca_testo non e' fra le colonne concesse ad anon").toContain("ricerca_testo");
  });

  it("e le colonne pubbliche di prima non sono sparite", () => {
    // `revoke` piu' `grant` riscrive l'elenco per intero: dimenticarne una
    // spegnerebbe un pezzo di vetrina.
    const elenco = sql.slice(sql.indexOf("grant select ("), sql.indexOf(") on public.vehicles to anon"));
    for (const colonna of ["id", "dealer_id", "brand", "model", "version", "price", "published", "video_url"]) {
      expect(elenco, `manca ${colonna} fra le colonne pubbliche`).toContain(colonna);
    }
  });
});
