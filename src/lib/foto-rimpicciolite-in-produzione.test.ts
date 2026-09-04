import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { motivoFotoIntera } from "@/lib/foto-misure";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const configurazione = leggi("next.config.ts");
const rotta = leggi("src/app/api/image-proxy/route.ts");

/**
 * Il difetto, misurato in produzione il 04/09/2026: la stessa foto chiesta a
 * 384 e a 3840 pixel tornava identica, 197 KB in tutti i casi. Sulla pagina
 * con ventiquattro schede sono quasi 5 MB invece di 410 KB.
 *
 * Sharp e' fatto di due pezzi: un piccolo binario e la libreria vera,
 * `libvips-cpp.so.8.18.6`, diciotto megabyte. Il tracciamento di Next segue le
 * dipendenze del codice JavaScript e copia il primo, ma non sa leggere dentro
 * un binario nativo: la libreria che quel binario pretende restava fuori dalla
 * funzione pubblicata.
 *
 * **In locale non si vedeva**, perche' qui la libreria c'e' e sharp ha anche
 * un ripiego in WebAssembly che su Vercel non viene installato. E' il genere
 * di difetto che esiste solo sulla macchina che nessuno guarda.
 *
 * Riprodotto ricostruendo il pacchetto pubblicato dal file di tracciamento,
 * con e senza quella libreria:
 *   senza -> ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.6: cannot open shared
 *            object file: No such file or directory
 *   con   -> rimpicciolimento nativo riuscito
 */
describe("la libreria che rimpicciolisce arriva nella funzione pubblicata", () => {
  it("la configurazione la fa copiare a mano nella rotta delle foto", () => {
    expect(configurazione).toContain("outputFileTracingIncludes");
    expect(configurazione).toContain('"/api/image-proxy"');
    expect(configurazione).toContain("@img/sharp-libvips-linux-x64");
  });

  // La chiave e' il percorso della rotta: sbagliarlo non da' errore, fa solo
  // tornare le foto intere -- cioe' il difetto di partenza, in silenzio.
  it("la chiave e' il percorso vero della rotta", () => {
    const rotte = [...configurazione.matchAll(/"(\/api\/[a-z-]+)":/g)].map((r) => r[1]);
    expect(rotte).toContain("/api/image-proxy");
  });

  it("si copia solo la variante che serve, non tutte le architetture", () => {
    // Ogni variante pesa diciotto megabyte: prenderle tutte gonfierebbe la
    // funzione per niente. Vercel esegue su linux x64.
    expect(configurazione).not.toContain("sharp-libvips-linuxmusl");
    expect(configurazione).not.toContain("sharp-libvips-darwin");
  });
});

/**
 * Il messaggio vero non finisce nell'intestazione -- la leggono tutti, e un
 * errore per esteso porta dentro i percorsi del server -- ma senza di lui
 * capire il difetto ha richiesto di ricostruire il pacchetto pubblicato e
 * provarlo pezzo per pezzo. Il nome del file mancante sarebbe bastato.
 */
describe("quando una foto arriva intera, il perche' resta scritto", () => {
  it("il messaggio vero va nei log del server", () => {
    expect(rotta).toContain("console.error");
    expect(rotta).toContain("segnalaUnaVolta(errore)");
  });

  it("una volta per processo, non a ogni foto", () => {
    expect(rotta).toContain("if (giaSegnalato) return");
  });

  // L'intestazione resta una categoria: non deve diventare il messaggio.
  it("l'intestazione continua a dire soltanto la categoria", () => {
    expect(rotta).toContain("`intera:${motivoFotoIntera(errore)}`");
    expect(rotta).not.toMatch(/x-foto-esito[^\n]*errore\.message/);
  });
});

/**
 * La classificazione e' quello che si legge da fuori: se sbagliasse categoria,
 * la prossima volta si cercherebbe nel posto sbagliato. Questi sono i messaggi
 * veri, presi dalle prove del 04/09/2026.
 */
describe("i messaggi veri finiscono nella categoria giusta", () => {
  it("la libreria condivisa mancante e' un modulo assente", () => {
    const vero =
      'Could not load the "sharp" module using the linux-x64 runtime\n' +
      "ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.6: cannot open shared object file: No such file or directory";
    expect(motivoFotoIntera(new Error(vero))).toBe("modulo-assente");
  });

  it("il pacchetto proprio assente pure", () => {
    expect(motivoFotoIntera(new Error("Cannot find module 'sharp'"))).toBe("modulo-assente");
  });

  // Sharp scrive "sharp" fra virgolette: una versione di Node troppo vecchia
  // NON finisce in "modulo-assente", e distinguerle e' il motivo per cui le
  // categorie esistono.
  it("una versione di Node troppo vecchia e' un'altra cosa", () => {
    const vero =
      'Could not load the "sharp" module using the linux-x64 runtime\n' +
      "Please upgrade Node.js: Found 18.20.4 Requires >=20.9.0";
    expect(motivoFotoIntera(new Error(vero))).toBe("altro");
  });

  it("un formato che la libreria non sa leggere resta a se'", () => {
    expect(motivoFotoIntera(new Error("Input file contains unsupported image format"))).toBe("formato-illeggibile");
  });
});
