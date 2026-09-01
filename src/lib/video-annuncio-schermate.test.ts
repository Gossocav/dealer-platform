import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pianoComprende } from "@/lib/funzioni-per-piano";

function leggi(percorso: string) {
  return readFileSync(resolve(process.cwd(), percorso), "utf8");
}

const modulo = leggi("src/components/vehicles/vehicle-editor-page.tsx");
const paginaPubblica = leggi("src/app/(marketplace)/auto/[id]/page.tsx");
const proxy = leggi("src/proxy.ts");
const migration = leggi("supabase/migrations/20260901030000_video_annuncio.sql");

describe("il video e' una funzione del Piano Elite", () => {
  it("solo l'Elite lo apre", () => {
    expect(pianoComprende("base", "video-annuncio")).toBe(false);
    expect(pianoComprende("pro", "video-annuncio")).toBe(false);
    expect(pianoComprende("elite", "video-annuncio")).toBe(true);
  });

  // A chi non ha il piano non si mostra un campo che poi non comparirebbe
  // sull'annuncio: si compilerebbe una cosa che non si vede da nessuna parte.
  it("il campo compare nel modulo solo a chi ce l'ha", () => {
    expect(modulo).toContain('pianoComprende(planCode, "video-annuncio")');
  });
});

/**
 * Il difetto che questi test impediscono: salvare un collegamento qualunque.
 * Il sito blocca ogni contenuto esterno e apre il riquadro al solo dominio di
 * YouTube: un indirizzo diverso darebbe un rettangolo bianco, e il
 * concessionario crederebbe che la piattaforma sia rotta.
 */
describe("solo un video YouTube, e detto mentre si incolla", () => {
  it("il salvataggio si ferma su un collegamento che non e' un video", () => {
    expect(modulo).toContain("!identificativoVideo(state.videoUrl)");
    expect(modulo).toContain("AVVISO_VIDEO_NON_VALIDO");
  });

  it("si salva normalizzato, non come e' stato incollato", () => {
    expect(modulo).toContain("video_url: indirizzoDaSalvare(state.videoUrl)");
  });

  it("la pagina pubblica costruisce il riquadro solo da un video vero", () => {
    expect(paginaPubblica).toContain("indirizzoDelRiquadro(vehicle.video_url)");
    expect(paginaPubblica).toContain("{video ? (");
  });
});

describe("la sicurezza del sito si apre a quel dominio e a nessun altro", () => {
  it("la policy nomina il dominio senza cookie", () => {
    expect(proxy).toContain('const VIDEO_FRAME_SRC = "https://www.youtube-nocookie.com"');
    expect(proxy).toContain("frame-src ${VIDEO_FRAME_SRC}");
  });

  // frame-src dice chi possiamo ospitare noi; frame-ancestors dice chi puo'
  // ospitare noi. Sono due cose opposte, e la seconda deve restare chiusa.
  it("nessuno puo' mettere le nostre pagine dentro un riquadro suo", () => {
    expect(proxy).toContain("frame-ancestors 'none'");
  });
});

/**
 * Su `vehicles` il pubblico ha i permessi colonna per colonna: aggiungere la
 * colonna senza rifare l'elenco lascerebbe il video invisibile al marketplace,
 * cioe' proprio a chi deve guardarlo.
 */
describe("la colonna e' leggibile dal marketplace, le riservate no", () => {
  it("l'elenco dei permessi pubblici comprende il video", () => {
    const elenco = migration.slice(migration.lastIndexOf("grant select ("), migration.indexOf(") on public.vehicles to anon"));
    expect(elenco).toContain("video_url");
  });

  it("e non ci sono finite targa, telaio o le colonne dell'importazione", () => {
    const elenco = migration.slice(migration.lastIndexOf("grant select ("), migration.indexOf(") on public.vehicles to anon"));
    // Le colonne si cercano intere: "vin" sta dentro "pro**vin**ce", e un
    // controllo per pezzi di parola fallirebbe su una colonna innocente
    // facendo credere a una fuga che non c'e'.
    const colonne = elenco
      .split("\n")
      .map((riga) => riga.trim().replace(/,$/, ""))
      .filter((riga) => /^[a-z_]+$/.test(riga));

    expect(colonne.length, "l'elenco delle colonne non e' stato letto").toBeGreaterThan(20);

    for (const riservata of ["plate", "vin", "customer_id", "import_source", "import_missing_since"]) {
      expect(colonne, `${riservata} non deve essere pubblica`).not.toContain(riservata);
    }
    expect(colonne).toContain("video_url");
  });

  it("il permesso vecchio si toglie prima di rifarlo", () => {
    // `grant select (...)` non sostituisce quello di prima: lo affianca. Senza
    // la revoca resterebbe in piedi l'elenco precedente.
    expect(migration.indexOf("revoke select on public.vehicles from anon")).toBeLessThan(
      migration.lastIndexOf("grant select (")
    );
  });
});
