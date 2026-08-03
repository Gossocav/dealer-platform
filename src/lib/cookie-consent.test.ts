import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  CONSENT_UNKNOWN,
  clearStoredConsent,
  readClientConsent,
  readServerConsent,
  readStoredConsent,
  storeConsent,
} from "@/lib/cookie-consent";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

type FintoStorage = { valori: Map<string, string>; lancia: boolean };

function installaFintoBrowser(): FintoStorage {
  const stato: FintoStorage = { valori: new Map(), lancia: false };

  const storage = {
    getItem: (key: string) => {
      if (stato.lancia) throw new Error("archiviazione bloccata");
      return stato.valori.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (stato.lancia) throw new Error("archiviazione bloccata");
      stato.valori.set(key, value);
    },
    removeItem: (key: string) => {
      if (stato.lancia) throw new Error("archiviazione bloccata");
      stato.valori.delete(key);
    },
  };

  vi.stubGlobal("window", {
    localStorage: storage,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    CustomEvent: class {
      constructor(public type: string, public init?: unknown) {}
    },
  });
  vi.stubGlobal("CustomEvent", class {
    constructor(public type: string, public init?: unknown) {}
  });

  return stato;
}

beforeEach(() => {
  installaFintoBrowser();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// La regola che conta: finche' la scelta non e' stata fatta, non parte niente.
// Non esiste consenso implicito allo scorrimento.
describe("la scelta si ricorda, e prima di sceglierla non vale nulla", () => {
  it("all'inizio non c'e' nessuna scelta", () => {
    expect(readStoredConsent()).toBeNull();
  });

  it("ricorda sia il si' che il no", () => {
    storeConsent("accettato");
    expect(readStoredConsent()).toBe("accettato");

    storeConsent("rifiutato");
    expect(readStoredConsent()).toBe("rifiutato");
  });

  // Un consenso che non si puo' ritirare con la stessa facilita' con cui si e'
  // dato non e' un consenso valido.
  it("si puo' cancellare per rifarla", () => {
    storeConsent("accettato");
    clearStoredConsent();
    expect(readStoredConsent()).toBeNull();
  });

  it("un valore inventato non vale come consenso", () => {
    installaFintoBrowser().valori.set(CONSENT_STORAGE_KEY, "forse");
    expect(readStoredConsent()).toBeNull();
  });

  // Navigazione in incognito con archiviazione bloccata: senza memoria la
  // scelta si richiede a ogni visita, che e' il comportamento prudente.
  it("se non si puo' scrivere, non si finge che sia stato accettato", () => {
    const stato = installaFintoBrowser();
    stato.lancia = true;

    expect(() => storeConsent("accettato")).not.toThrow();
    expect(readStoredConsent()).toBeNull();
  });

  // "Non lo so" e' diverso da "non ha ancora scelto": se il server dicesse la
  // seconda cosa disegnerebbe il banner dentro l'HTML, che viene conservato e
  // riservito. E' successo davvero sulla home, che per ore ha servito una
  // copia costruita prima che il consenso esistesse.
  it("il server dice di non sapere, non che la scelta non e' stata fatta", () => {
    expect(readServerConsent()).toBe(CONSENT_UNKNOWN);
    expect(readServerConsent()).not.toBeNull();
  });

  it("nel browser invece la risposta e' quella vera", () => {
    expect(readClientConsent()).toBeNull();
    storeConsent("accettato");
    expect(readClientConsent()).toBe("accettato");
  });
});

// Un consenso raccolto dopo che lo strumento e' gia' partito non serve a niente.
describe("niente si carica prima del si'", () => {
  const scripts = read("src/components/marketplace/measurement-scripts.tsx");
  const banner = read("src/components/marketplace/cookie-consent-banner.tsx");
  const proxy = read("src/proxy.ts");

  it("lo strumento di misura non compare finche' il consenso non e' esplicito", () => {
    expect(scripts).toContain('consenso !== "accettato"');
    expect(scripts).toContain("return null;");
  });

  it("senza identificativo configurato non si carica niente e non si chiede niente", () => {
    expect(scripts).toContain("!measurementId");
    expect(banner).toContain("!getMeasurementId()");
  });

  // Il banner disegnato dal server finirebbe dentro l'HTML conservato, e chi
  // riceve una copia vecchia non lo vedrebbe mai: e' successo sulla home.
  it("la richiesta di consenso nasce nel browser, non nell'HTML conservato", () => {
    for (const [nome, sorgente] of [
      ["banner", banner],
      ["collegamento preferenze", read("src/components/marketplace/cookie-preferences-link.tsx")],
    ] as const) {
      expect(sorgente, nome).toContain("CONSENT_UNKNOWN");
      expect(sorgente, nome).toContain("readServerConsent");
    }
  });

  // Rifiutare deve costare quanto accettare: due bottoni, nessuna X che
  // equivale a un si'.
  it("il banner offre rifiuto e accettazione allo stesso modo", () => {
    expect(banner).toContain('scegli("rifiutato")');
    expect(banner).toContain('scegli("accettato")');
    expect(banner).toContain("/privacy");
  });

  it("le regole di sicurezza si aprono solo se lo strumento e' configurato", () => {
    // Allargarle "per quando servira'" sarebbe una porta aperta per nessuno.
    expect(proxy).toContain("MEASUREMENT_CONFIGURED");
    expect(proxy).toContain("googletagmanager.com");
    expect(proxy).toMatch(/MEASUREMENT_CONFIGURED \? " https:\/\/www\.googletagmanager\.com" : ""/);
  });
});

// L'informativa dichiarava che il sito non usa cookie di misurazione: dal
// momento in cui se ne installa uno, quella frase e' falsa.
describe("l'informativa dice quello che il sito fa davvero", () => {
  const privacy = read("src/app/(marketplace)/privacy/page.tsx");

  it("non nega piu' l'uso di cookie di misurazione", () => {
    expect(privacy).not.toContain("Non\n              vengono utilizzati cookie di profilazione o di marketing di terze parti.");
    expect(privacy).toContain("Cookie di misurazione");
  });

  it("dice che senza consenso non vengono installati", () => {
    expect(privacy).toContain("non vengono installati finché non presti il consenso");
  });

  it("spiega come cambiare idea", () => {
    expect(privacy).toContain("Preferenze cookie");
  });
});
