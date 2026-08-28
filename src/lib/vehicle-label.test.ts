import { describe, expect, it } from "vitest";
import { derivaVersioneDalTitolo, normalizzaModello, ripulisciTitoloVeicolo, stripLeadingRepeat } from "@/lib/vehicle-label";

describe("stripLeadingRepeat", () => {
  it("toglie la ripetizione in testa", () => {
    expect(stripLeadingRepeat("Hyundai Tucson N Line", "Hyundai Tucson")).toBe("N Line");
  });

  it("svuota il campo quando e' solo la ripetizione", () => {
    expect(stripLeadingRepeat("Hyundai Tucson", "Hyundai Tucson")).toBe("");
  });

  it("non guarda le maiuscole", () => {
    expect(stripLeadingRepeat("hyundai tucson 1.6", "Hyundai Tucson")).toBe("1.6");
  });

  // Solo a parola intera: "Tucson" non e' una ripetizione di "Tuc".
  it("non taglia a meta' di una parola", () => {
    expect(stripLeadingRepeat("Tucson", "Tuc")).toBe("Tucson");
  });

  it("lascia stare una ripetizione che non e' in testa", () => {
    expect(stripLeadingRepeat("1.6 CRDi Tucson Edition", "Tucson")).toBe("1.6 CRDi Tucson Edition");
  });

  it("con un campo vuoto non fa niente", () => {
    expect(stripLeadingRepeat("", "Hyundai")).toBe("");
    expect(stripLeadingRepeat("Hyundai Tucson", "")).toBe("Hyundai Tucson");
  });
});

// Il difetto vero: l'importazione da sito trova un titolo intero, non una
// versione, e scrivendolo tal quale ogni veicolo importato nasceva con marca e
// modello ripetuti dentro la versione.
describe("derivaVersioneDalTitolo", () => {
  it("tiene solo quello che il titolo aggiunge a marca e modello", () => {
    expect(derivaVersioneDalTitolo("Hyundai Tucson 1.6 CRDi Xline", "Hyundai", "Tucson")).toBe("1.6 CRDi Xline");
  });

  it("torna null quando il titolo e' solo marca e modello", () => {
    expect(derivaVersioneDalTitolo("Hyundai Tucson", "Hyundai", "Tucson")).toBeNull();
  });

  it("toglie anche il solo modello ripetuto", () => {
    expect(derivaVersioneDalTitolo("Tucson 1.6 CRDi", "Hyundai", "Tucson")).toBe("1.6 CRDi");
  });

  it("lascia intero un titolo che non ripete niente", () => {
    expect(derivaVersioneDalTitolo("1.6 CRDi Xline", "Hyundai", "Tucson")).toBe("1.6 CRDi Xline");
  });

  it("regge marca o modello mancanti", () => {
    expect(derivaVersioneDalTitolo("Hyundai Tucson 1.6", null, "Tucson")).toBe("Hyundai Tucson 1.6");
    expect(derivaVersioneDalTitolo("Hyundai Tucson 1.6", "Hyundai", null)).toBe("Tucson 1.6");
  });

  it("torna null su un titolo vuoto", () => {
    expect(derivaVersioneDalTitolo(null, "Hyundai", "Tucson")).toBeNull();
    expect(derivaVersioneDalTitolo("   ", "Hyundai", "Tucson")).toBeNull();
  });
});

// Tutti i casi qui sotto sono presi dai 235 veicoli in produzione il
// 28/08/2026, non inventati. Erano titoli di annunci pubblici: quello che si
// leggeva sulla scheda e quello che Google riceveva nel <title>.
describe("normalizzaModello", () => {
  it("apre il modello scritto come sta nell'indirizzo", () => {
    // 14 veicoli su 235. Sull'annuncio si leggeva "Land Rover
    // Range-rover-evoque", perche' il sito dichiara il modello nei dati
    // strutturati con la stessa forma che usa nell'URL.
    expect(normalizzaModello("range-rover-evoque")).toBe("range rover evoque");
    expect(normalizzaModello("grand-cherokee")).toBe("grand cherokee");
    expect(normalizzaModello("classe-b")).toBe("classe b");
  });

  it("non tocca un modello che il trattino ce l'ha per davvero", () => {
    // Il rischio opposto: "Classe-A" e "CR-V" si scrivono cosi'.
    expect(normalizzaModello("Classe-A")).toBe("Classe-A");
    expect(normalizzaModello("CR-V")).toBe("CR-V");
    expect(normalizzaModello("Tucson")).toBe("Tucson");
  });

  it("non inventa niente da un campo vuoto", () => {
    expect(normalizzaModello(null)).toBeNull();
    expect(normalizzaModello("  ")).toBeNull();
  });
});

describe("ripulisciTitoloVeicolo", () => {
  it("toglie l'anno in coda", () => {
    // 231 veicoli su 235. L'anno sulla scheda c'e' gia' alla voce
    // Immatricolazione, e nel titolo costava cinque caratteri su sessanta.
    expect(ripulisciTitoloVeicolo("Jeep Grand Cherokee 2.0 PHEV 2025")).toBe("Jeep Grand Cherokee 2.0 PHEV");
  });

  it("non tocca un anno che sta in mezzo, perche' li' e' un dato", () => {
    expect(ripulisciTitoloVeicolo("Mazda 3 2025 5HB 2.5L")).toBe("Mazda 3 2025 5HB 2.5L");
  });

  it("toglie la partita IVA insieme all'insegna che la precede", () => {
    // "Stepway 1.5 dCi AUTOGEPY SASSUOLO 05361881051 2018": togliendo solo le
    // undici cifre restava "Sassuolo" appeso in fondo al titolo.
    expect(ripulisciTitoloVeicolo("Stepway 1.5 dCi AUTOGEPY SASSUOLO 05361881051 2018")).toBe("Stepway 1.5 dCi");
  });

  it("non tocca le sigle tecniche tutte maiuscole", () => {
    // La regola e' ancorata alla partita IVA e non alle maiuscole: 66 titoli
    // su 235 contengono parole tutte maiuscole, e sono dati veri. Una regola
    // sulle maiuscole in quanto tali svuoterebbe le schede.
    expect(ripulisciTitoloVeicolo("Jeep Compass 2.0 PHEV ATX 4xe AWD DCT")).toBe("Jeep Compass 2.0 PHEV ATX 4xe AWD DCT");
    expect(ripulisciTitoloVeicolo("Kia Sportage 1.6 CRDI 136 CV MHEV")).toBe("Kia Sportage 1.6 CRDI 136 CV MHEV");
  });

  it("toglie la filiale", () => {
    expect(ripulisciTitoloVeicolo("1.3 CDTI 5 porte Advance * SEDE DI CARPI * 2017")).toBe("1.3 CDTI 5 porte Advance");
  });

  it("toglie i richiami tipografici ma tiene le parole", () => {
    // Le virgolette non dicono niente; "TAGLIANDATA E GARANTITA 12 MESI" si'.
    expect(ripulisciTitoloVeicolo('Grand Cherokee Summit KM0!!!! 2025')).toBe("Grand Cherokee Summit KM0");
    expect(ripulisciTitoloVeicolo('Classe B 180 d Sport"TAGLIANDATA 12 MESI" 2016')).toBe("Classe B 180 d Sport TAGLIANDATA 12 MESI");
  });

  it("toglie il nome della concessionaria ricavandolo dall'indirizzo del sito", () => {
    expect(
      ripulisciTitoloVeicolo("Tucson 1.6 CRDi AUTOGEPY 2019", { sorgente: "https://www.autogepy.it/auto/usate/x/123/" })
    ).toBe("Tucson 1.6 CRDi");
  });

  it("non tocca un titolo gia' pulito", () => {
    expect(ripulisciTitoloVeicolo("1.6 CRDi Xline")).toBe("1.6 CRDi Xline");
  });
});

describe("la ripetizione si riconosce anche quando i due la scrivono diversa", () => {
  it("modello nell'indirizzo, titolo per esteso", () => {
    // Il caso peggiore misurato in produzione, 107 caratteri:
    // "Land Rover range-rover-evoque Land Rover Range Rover Evoque 2.2 Sd4
    //  Pure AUTOGEPY SASSUOLO 05361881051 2012"
    expect(
      derivaVersioneDalTitolo(
        "Land Rover Range Rover Evoque 2.2 Sd4 Pure AUTOGEPY SASSUOLO 05361881051 2012",
        "Land Rover",
        "range-rover-evoque"
      )
    ).toBe("2.2 Sd4 Pure");
  });

  it("continua a non tagliare a meta' di una parola", () => {
    expect(stripLeadingRepeat("Tucson", "Tuc")).toBe("Tucson");
    expect(stripLeadingRepeat("Tucson N Line", "Tuc")).toBe("Tucson N Line");
  });
});
