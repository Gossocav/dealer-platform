import { describe, expect, it } from "vitest";
import fotoDelSito from "@/lib/image-loader";

/**
 * Il difetto che questi test impediscono: il 04/09/2026 ogni fotografia del
 * sito e' scomparsa in una volta, perche' passavano tutte dal servizio di
 * ridimensionamento a consumo di Vercel e il pacchetto compreso nel piano si
 * e' esaurito ("Payment required" al posto dell'immagine). Se una foto tornasse
 * a chiedere quel servizio, tornerebbe a sparire appena il tetto si esaurisce.
 */
describe("dove il sito va a prendere le fotografie", () => {
  it("le foto importate restano sul nostro proxy, con la misura aggiunta", () => {
    const proxy = "/api/image-proxy?url=https%3A%2F%2Fcdn.dealerk.it%2Ffoto.jpg";

    expect(fotoDelSito({ src: proxy, width: 640 })).toBe(`${proxy}&w=640&q=75`);
  });

  it("le foto dell'archivio Supabase ci passano da dentro", () => {
    const firmata = "https://progetto.supabase.co/storage/v1/object/sign/vehicle-images/foto.jpg?token=abc";
    const risultato = fotoDelSito({ src: firmata, width: 828, quality: 50 });

    expect(risultato.startsWith("/api/image-proxy?url=")).toBe(true);
    expect(risultato).toContain(encodeURIComponent(firmata));
    expect(risultato.endsWith("&w=828&q=50")).toBe(true);
  });

  // Se una sola foto restasse su /_next/image, quella tornerebbe a mancare
  // appena il tetto di Vercel si esaurisce.
  it("nessuna foto passa piu' dal ridimensionatore di Vercel", () => {
    const sorgenti = [
      "/api/image-proxy?url=https%3A%2F%2Fesempio.it%2Ffoto.jpg",
      "https://progetto.supabase.co/storage/v1/object/sign/vehicle-images/foto.jpg",
      "https://esempio.it/logo.png",
      "/logo.svg",
      "data:image/png;base64,iVBORw0KGgo=",
    ];

    for (const src of sorgenti) {
      expect(fotoDelSito({ src, width: 640 }), src).not.toContain("/_next/image");
    }
  });

  /**
   * Un file del sito e un'immagine incorporata nella pagina si servono come
   * sono: sono gia' piccoli, e farli rimbalzare sul proxy costerebbe una
   * chiamata per guadagnare niente. Con "data:" sarebbe anche peggio, perche'
   * il proxy non saprebbe da dove scaricarla e la pagina resterebbe vuota.
   */
  it("un file del sito, e un'immagine incorporata, si servono come sono", () => {
    expect(fotoDelSito({ src: "/logo.svg", width: 640 })).toBe("/logo.svg");
    expect(fotoDelSito({ src: "data:image/png;base64,iVBORw0KGgo=", width: 16 })).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(fotoDelSito({ src: "blob:http://localhost/abc", width: 96 })).toBe("blob:http://localhost/abc");
  });

  // Le larghezze che il loader chiede sono le stesse che il proxy accetta:
  // se le due liste si scollassero, il proxy servirebbe l'originale intero
  // credendo che nessuna misura fosse stata chiesta.
  it("chiede solo larghezze che il proxy sa riconoscere", async () => {
    const { LARGHEZZE_FOTO_AMMESSE, larghezzaFotoRichiesta } = await import("@/lib/foto-misure");

    for (const larghezza of LARGHEZZE_FOTO_AMMESSE) {
      const indirizzo = fotoDelSito({ src: "https://esempio.it/foto.jpg", width: larghezza });
      const chiesta = new URL(indirizzo, "http://local").searchParams.get("w");

      expect(larghezzaFotoRichiesta(chiesta), `w=${larghezza}`).toBe(larghezza);
    }
  });
});
