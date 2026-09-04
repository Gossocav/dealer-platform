import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  accettaWebp,
  larghezzaFotoRichiesta,
  qualitaFotoRichiesta,
  rimpicciolisciFoto,
} from "@/lib/foto-misure";

/**
 * Il difetto che questi test impediscono: il 04/09/2026 tutte le foto del sito
 * sono sparite in una volta -- home, catalogo, ricerca, schede, pagine delle
 * concessionarie -- perche' il ridimensionamento lo faceva il servizio a
 * consumo di Vercel e il pacchetto compreso nel piano si e' esaurito. Adesso
 * lo fa questo codice; se smette di funzionare le foto sparirebbero
 * esattamente come allora.
 */
async function fotoDiProva(larghezza: number, altezza: number) {
  return sharp({
    create: { width: larghezza, height: altezza, channels: 3, background: "#334455" },
  })
    .jpeg()
    .toBuffer();
}

describe("le misure che una pagina puo' chiedere", () => {
  it("accetta le larghezze che Next scrive nella srcset", () => {
    expect(larghezzaFotoRichiesta("640")).toBe(640);
    expect(larghezzaFotoRichiesta("16")).toBe(16);
    expect(larghezzaFotoRichiesta("3840")).toBe(3840);
  });

  /**
   * Senza questo controllo chiunque potrebbe chiedere la stessa foto in
   * diecimila misure diverse: diecimila ridimensionamenti sul nostro server, e
   * diecimila copie da conservare, per una pagina che non li usa.
   */
  it("una larghezza che il sito non userebbe mai non ridimensiona niente", () => {
    for (const valore of ["639", "0", "-640", "99999", "abc", "", null, "640.5"]) {
      expect(larghezzaFotoRichiesta(valore), `${valore} non doveva passare`).toBeNull();
    }
  });

  it("la qualita' sta fra 1 e 100, e in mancanza vale 75", () => {
    expect(qualitaFotoRichiesta("50")).toBe(50);
    expect(qualitaFotoRichiesta(null)).toBe(75);
    expect(qualitaFotoRichiesta("0")).toBe(75);
    expect(qualitaFotoRichiesta("101")).toBe(75);
    expect(qualitaFotoRichiesta("mille")).toBe(75);
  });

  /**
   * Il compositore delle anteprime social legge soltanto JPEG e PNG: servirgli
   * webp gli faceva sollevare "Unsupported image type", cioe' un errore al
   * posto dell'immagine condivisa.
   */
  it("il webp si serve solo a chi lo dichiara", () => {
    expect(accettaWebp("image/avif,image/webp,image/apng,*/*;q=0.8")).toBe(true);
    expect(accettaWebp("image/jpeg,image/png;q=0.9,*/*;q=0.1")).toBe(false);
    expect(accettaWebp(null)).toBe(false);
  });
});

describe("il ridimensionamento", () => {
  it("consegna la foto nella larghezza chiesta, in webp", async () => {
    const ridotta = await rimpicciolisciFoto(await fotoDiProva(1200, 800), 640, 75, true);
    const misure = await sharp(ridotta).metadata();

    expect(misure.width).toBe(640);
    expect(misure.format).toBe("webp");
  });

  it("a chi non legge il webp lascia il formato di partenza", async () => {
    const ridotta = await rimpicciolisciFoto(await fotoDiProva(1200, 800), 640, 75, false);
    const misure = await sharp(ridotta).metadata();

    expect(misure.width).toBe(640);
    expect(misure.format).toBe("jpeg");
  });

  /**
   * La srcset chiede anche misure piu' grandi dell'originale. Ingrandire non
   * aggiunge dettaglio, aggiunge peso da scaricare: una foto da 1200 pixel
   * chiesta a 3840 resta di 1200.
   */
  it("non ingrandisce una foto piu' piccola di quanto e' stata chiesta", async () => {
    const ridotta = await rimpicciolisciFoto(await fotoDiProva(1200, 800), 3840, 75, true);

    expect((await sharp(ridotta).metadata()).width).toBe(1200);
  });

  /**
   * Le foto scattate col telefono portano l'orientamento in una nota a parte
   * invece che nei pixel. Senza raddrizzarle prima, il ridimensionamento
   * butta via la nota e le consegna coricate.
   */
  it("raddrizza le foto che portano l'orientamento in una nota a parte", async () => {
    const coricata = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#334455" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const misure = await sharp(await rimpicciolisciFoto(coricata, 640, 75, true)).metadata();

    expect(misure.width).toBe(640);
    expect(misure.height).toBeGreaterThan(misure.width!);
  });

  /**
   * Chi lo chiama serve allora la foto come e' arrivata: un originale intero e'
   * comunque meglio di un buco nella pagina.
   */
  it("su qualcosa che non e' una fotografia solleva un errore, non consegna spazzatura", async () => {
    await expect(rimpicciolisciFoto(Buffer.from("questo non e' un jpeg"), 640, 75, true)).rejects.toThrow();
  });
});
