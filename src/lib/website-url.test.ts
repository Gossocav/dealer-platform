import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl } from "@/lib/website-url";

describe("il sito si puo' scrivere come viene", () => {
  it("completa l'indirizzo scritto senza prefisso", () => {
    expect(normalizeWebsiteUrl("www.tuaconcessionaria.it")).toEqual({
      url: "https://www.tuaconcessionaria.it/",
      error: null,
    });
    expect(normalizeWebsiteUrl("tuaconcessionaria.it").url).toBe("https://tuaconcessionaria.it/");
  });

  it("accetta gli spazi intorno, che nascono dal copia-incolla", () => {
    expect(normalizeWebsiteUrl("  https://tuaconcessionaria.it  ").url).toBe("https://tuaconcessionaria.it/");
  });

  it("tiene la pagina interna, se il concessionario ne indica una", () => {
    expect(normalizeWebsiteUrl("tuaconcessionaria.it/usato?ordine=prezzo").url).toBe(
      "https://tuaconcessionaria.it/usato?ordine=prezzo",
    );
  });

  // Promuovere http a https porterebbe l'utente su una pagina che non risponde:
  // non tutti i siti hanno il certificato.
  it("non promuove http a https di sua iniziativa", () => {
    expect(normalizeWebsiteUrl("http://tuaconcessionaria.it").url).toBe("http://tuaconcessionaria.it/");
  });

  it("un campo vuoto resta vuoto: il sito non e' obbligatorio", () => {
    for (const vuoto of ["", "   ", null, undefined]) {
      expect(normalizeWebsiteUrl(vuoto)).toEqual({ url: null, error: null });
    }
  });
});

describe("quello che non e' un sito viene rifiutato", () => {
  // Il rifiuto che conta: non e' un indirizzo, e' codice che verrebbe eseguito
  // nel browser di chi lo clicca.
  it("rifiuta gli indirizzi che eseguono codice", () => {
    for (const pericoloso of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      const result = normalizeWebsiteUrl(pericoloso);
      expect(result.url, pericoloso).toBeNull();
      expect(result.error, pericoloso).toBeTruthy();
    }
  });

  it("rifiuta anche i protocolli innocui ma fuori posto", () => {
    expect(normalizeWebsiteUrl("mailto:info@tuaconcessionaria.it").url).toBeNull();
    expect(normalizeWebsiteUrl("ftp://tuaconcessionaria.it").url).toBeNull();
  });

  it("rifiuta una parola scritta nel campo sbagliato", () => {
    const result = normalizeWebsiteUrl("la mia concessionaria");
    expect(result.url).toBeNull();
    expect(result.error).toBeTruthy();

    // Senza il punto diventerebbe "https://concessionaria", un indirizzo
    // plausibile che non esiste.
    expect(normalizeWebsiteUrl("concessionaria").url).toBeNull();
  });

  it("rifiuta un indirizzo spezzato da uno spazio", () => {
    const result = normalizeWebsiteUrl("www.tua concessionaria.it");
    expect(result.url).toBeNull();
    expect(result.error).toContain("spazi");
  });

  it("spiega sempre il perche', senza gergo", () => {
    for (const sbagliato of ["javascript:alert(1)", "concessionaria", "www.tua concessionaria.it"]) {
      const { error } = normalizeWebsiteUrl(sbagliato);
      expect(error, sbagliato).toBeTruthy();
      expect(error, sbagliato).not.toMatch(/URL|protocol|hostname|parse/i);
    }
  });
});

describe("salvare due volte non cambia il risultato", () => {
  it("un indirizzo gia' normalizzato resta identico", () => {
    for (const indirizzo of ["www.tuaconcessionaria.it", "tuaconcessionaria.it/usato", "http://tuaconcessionaria.it"]) {
      const primo = normalizeWebsiteUrl(indirizzo).url as string;
      expect(normalizeWebsiteUrl(primo).url, indirizzo).toBe(primo);
    }
  });
});
