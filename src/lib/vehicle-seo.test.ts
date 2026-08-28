import { describe, expect, it } from "vitest";
import { CARATTERI_VISIBILI_TITOLO, descrizioneSeoVeicolo, titoloSeoVeicolo } from "@/lib/vehicle-seo";

/**
 * Il difetto che questi test impediscono, misurato in produzione il
 * 28/08/2026: su 235 annunci c'erano solo 206 titoli distinti. Ventuno titoli
 * erano ripetuti, coprendo 50 schede, e cinque annunci arrivavano a chiamarsi
 * esattamente allo stesso modo. Per Google cinque pagine con lo stesso titolo
 * sono cinque copie: ne sceglie una e ignora le altre.
 */
describe("titoloSeoVeicolo", () => {
  it("aggiunge il colore, che e' cio' che distingue due km 0 gemelle", () => {
    expect(titoloSeoVeicolo("Peugeot 2008 Allure PureTech 100 S&S", { color: "Bianco" })).toBe(
      "Peugeot 2008 Allure PureTech 100 S&S · Bianco"
    );
  });

  it("senza colore non appende un separatore vuoto", () => {
    expect(titoloSeoVeicolo("Peugeot 2008 Allure", { color: null })).toBe("Peugeot 2008 Allure");
    expect(titoloSeoVeicolo("Peugeot 2008 Allure", { color: "   " })).toBe("Peugeot 2008 Allure");
  });

  it("il titolo di una gemella resta dentro cio' che Google mostra", () => {
    // La misura che ha deciso la forma: le schede che condividono il titolo
    // sono le piu' corte -- sono i km 0 dello stesso modello -- e con il
    // colore restano sotto la soglia. Se un giorno il colore diventasse due
    // parole lunghe questo test non basterebbe piu' a garantirlo, e infatti
    // guarda un caso vero, non uno inventato corto apposta.
    const titolo = titoloSeoVeicolo("Peugeot 2008 Allure PureTech 100 S&S", { color: "Bianco" });
    expect(titolo.length + " | KeyAuto".length).toBeLessThanOrEqual(CARATTERI_VISIBILI_TITOLO);
  });
});

/**
 * La descrizione diceva "<titolo> disponibile presso <concessionaria>.
 * Prezzo: X": ripeteva il titolo parola per parola e non dava a chi legge
 * niente per scegliere fra due risultati.
 */
describe("descrizioneSeoVeicolo", () => {
  const veicolo = {
    mileage: 78500,
    fuel: "Diesel",
    transmission: "Automatico",
    registration_month: "09",
    year: 2018,
  };

  it("mette i dati che una persona confronta prima di cliccare", () => {
    const testo = descrizioneSeoVeicolo("Hyundai Tucson 1.6 CRDi", veicolo, "AUTOGEPY SPA", "24.900 €");
    expect(testo).toContain("78.500 km");
    expect(testo).toContain("immatricolata 09/2018");
    expect(testo).toContain("Diesel");
    expect(testo).toContain("Automatico");
    expect(testo).toContain("Prezzo: 24.900 €.");
    expect(testo).toContain("AUTOGEPY SPA");
  });

  it("un dato che manca sparisce, non diventa un trattino", () => {
    // Una descrizione che elenca cio' che non c'e' e' peggio di una corta:
    // e' quella che finisce sotto il titolo nei risultati di ricerca.
    const testo = descrizioneSeoVeicolo("Fiat Panda", { mileage: null, fuel: null, transmission: null }, "De Lorenzi Srl", null);
    expect(testo).not.toMatch(/-|non disponibile|null|undefined/i);
    expect(testo).toContain("De Lorenzi Srl");
  });

  it("i chilometri si scrivono come li scrive un italiano", () => {
    // Cinque cifre si separano, quattro no: in italiano si scrive 1234 e
    // 12.345. Non e' una svista di Intl, e' la regola -- l'ho scoperta
    // perche' questo test, scritto aspettandosi "1.234", e' fallito.
    expect(descrizioneSeoVeicolo("Fiat Panda", { mileage: 12345 }, "De Lorenzi Srl", null)).toContain("12.345 km");
    expect(descrizioneSeoVeicolo("Fiat Panda", { mileage: 1234 }, "De Lorenzi Srl", null)).toContain("1234 km");
    // Mai la virgola dell'inglese.
    expect(descrizioneSeoVeicolo("Fiat Panda", { mileage: 12345 }, "De Lorenzi Srl", null)).not.toContain("12,345");
  });

  it("le frasi sono chiuse, anche quella del prezzo", () => {
    // Senza il punto si leggeva "12.900 EUR In vendita presso AUTOGEPY":
    // due frasi appiccicate, ed e' il testo che compare sotto il titolo nei
    // risultati di ricerca.
    const testo = descrizioneSeoVeicolo("Hyundai Tucson", veicolo, "AUTOGEPY SPA", "24.900 €");
    expect(testo).not.toMatch(/€ [A-Z]/);
  });

  it("zero chilometri e' un dato, non un vuoto", () => {
    // Un km 0 dichiara zero: trattarlo come assente lo farebbe sparire dalla
    // descrizione proprio dove e' un argomento di vendita.
    expect(descrizioneSeoVeicolo("Jeep Avenger", { mileage: 0 }, "AUTOGEPY SPA", null)).toContain("0 km");
  });
});
