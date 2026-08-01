import { describe, expect, it } from "vitest";
import { formatWebsiteForDisplay, normalizeWebsiteUrl, resolveClickableWebsite } from "@/lib/website-url";

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

// Le righe salvate prima che il campo venisse irrobustito non sono mai passate
// dal controllo: la decisione se rendere cliccabile un valore va presa sul
// valore che si sta per disegnare, non su quello che si spera ci sia.
describe("il link pubblico si decide in lettura", () => {
  it("non rende cliccabile quello che non e' un indirizzo", () => {
    for (const vecchio of ["javascript:alert(1)", "la mia concessionaria", "concessionaria", "", null, undefined]) {
      expect(resolveClickableWebsite(vecchio), String(vecchio)).toBeNull();
      expect(formatWebsiteForDisplay(vecchio), String(vecchio)).toBeNull();
    }
  });

  it("rende cliccabile un indirizzo scritto senza prefisso", () => {
    expect(resolveClickableWebsite("www.tuaconcessionaria.it")).toBe("https://www.tuaconcessionaria.it/");
  });

  it("mostra il sito come si legge, non come si scrive", () => {
    expect(formatWebsiteForDisplay("https://www.tuaconcessionaria.it/")).toBe("www.tuaconcessionaria.it");
    expect(formatWebsiteForDisplay("www.tuaconcessionaria.it")).toBe("www.tuaconcessionaria.it");
    expect(formatWebsiteForDisplay("http://tuaconcessionaria.it")).toBe("tuaconcessionaria.it");
  });

  it("tiene la pagina precisa, se il concessionario ne ha indicata una", () => {
    expect(formatWebsiteForDisplay("tuaconcessionaria.it/usato")).toBe("tuaconcessionaria.it/usato");
  });

  // Il testo mostrato deve corrispondere a dove si finisce: un'etichetta che
  // dice un sito e un link che ne apre un altro e' esattamente la forma di un
  // inganno.
  it("l'etichetta e la destinazione parlano dello stesso sito", () => {
    for (const indirizzo of ["www.tuaconcessionaria.it", "tuaconcessionaria.it/usato", "http://tuaconcessionaria.it"]) {
      const href = resolveClickableWebsite(indirizzo) as string;
      const label = formatWebsiteForDisplay(indirizzo) as string;
      expect(href, indirizzo).toContain(label.split("/")[0]);
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
