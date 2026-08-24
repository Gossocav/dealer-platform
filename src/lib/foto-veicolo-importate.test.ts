import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveVehicleImageSource } from "@/lib/vehicles";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * Aprendo un veicolo in modifica il riquadro delle foto restava vuoto, e senza
 * vedere una foto non si puo' sceglierla ne' sostituirla.
 *
 * Le auto importate dal sito della concessionaria tengono in
 * `vehicle_images.image_url` l'indirizzo del listino di partenza, non un
 * percorso del nostro archivio: in produzione erano 394 righe su 400.
 * L'editor le passava lo stesso a `createSignedUrl` come se fossero percorsi;
 * la firma falliva, e il ripiego costruiva
 * `.../object/public/vehicle-images/https://cdn.dealerk.it/foto.jpeg`,
 * un indirizzo che non esiste.
 *
 * L'elenco veicoli la distinzione la faceva: e' per questo che le stesse foto
 * si vedevano li' e non nell'editor.
 */

// Indirizzi presi dalla produzione.
const FOTO_IMPORTATA = "https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800x0/33890/4uKbVDBJjGDBGNmx.jpeg";
const FOTO_ARCHIVIO = "dealer-abc/veicolo-123/foto-1.jpg";
const FOTO_ARCHIVIO_FIRMATA =
  "https://xyz.supabase.co/storage/v1/object/sign/vehicle-images/dealer-abc/veicolo-123/foto-1.jpg?token=abc";

describe("una foto importata si mostra passando dal nostro proxy", () => {
  it("non la si scambia per un percorso dell'archivio", () => {
    const source = resolveVehicleImageSource(FOTO_IMPORTATA);

    // Questo era il difetto: qui usciva "storage", e la foto spariva.
    expect(source.kind).toBe("proxy");
  });

  it("l'indirizzo prodotto e' nostro e porta dentro quello originale", () => {
    const source = resolveVehicleImageSource(FOTO_IMPORTATA);
    if (source.kind !== "proxy") throw new Error("atteso proxy");

    // Le regole di sicurezza della pagina ammettono solo immagini nostre
    // (img-src 'self'): l'indirizzo esterno il browser lo rifiuterebbe anche
    // se glielo passassimo giusto.
    expect(source.url.startsWith("/api/image-proxy?url=")).toBe(true);
    expect(new URL(source.url, "https://esempio.it").searchParams.get("url")).toBe(FOTO_IMPORTATA);
  });

  // Il controllo ingenuo cercava ".supabase.co" dentro tutta la stringa: un
  // indirizzo esterno che avesse quel testo nel percorso sarebbe stato
  // scambiato per roba nostra, e la foto sparirebbe di nuovo.
  it("non si fa ingannare da un indirizzo esterno che nel percorso cita supabase", () => {
    expect(resolveVehicleImageSource("https://cdn.esterno.it/copie/.supabase.co/foto.jpg").kind).toBe("proxy");
  });
});

describe("una foto nostra resta da firmare", () => {
  it("il percorso salvato nudo diventa un percorso d'archivio", () => {
    expect(resolveVehicleImageSource(FOTO_ARCHIVIO)).toEqual({ kind: "storage", path: FOTO_ARCHIVIO });
  });

  it("un indirizzo gia' firmato torna al suo percorso, senza il gettone scaduto", () => {
    const source = resolveVehicleImageSource(FOTO_ARCHIVIO_FIRMATA);
    expect(source).toEqual({ kind: "storage", path: FOTO_ARCHIVIO });
  });
});

describe("quando non c'e' niente da mostrare", () => {
  it("il vuoto non diventa un indirizzo", () => {
    for (const valore of ["", "   ", null, undefined]) {
      expect(resolveVehicleImageSource(valore).kind, String(valore)).toBe("nessuna");
    }
  });
});

// La decisione sta in un posto solo apposta: quando era scritta due volte, le
// due copie si sono separate e una delle due pagine ha smesso di mostrare le
// foto.
describe("l'editor e l'elenco chiedono alla stessa funzione", () => {
  it("nessuna delle due se la riscrive in casa", () => {
    for (const [nome, percorso] of [
      ["editor", "src/components/vehicles/vehicle-editor-page.tsx"],
      ["elenco", "src/components/vehicles/vehicles-management-page.tsx"],
    ] as const) {
      const sorgente = read(percorso);
      expect(sorgente, nome).toContain("resolveVehicleImageSource(");
      expect(sorgente, nome).not.toContain('includes(".supabase.co")');
      expect(sorgente, nome).not.toContain("/api/image-proxy?url=");
    }
  });
});
