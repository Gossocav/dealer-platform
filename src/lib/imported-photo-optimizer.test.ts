import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mapVehicleImageUrlForDisplay } from "@/lib/vehicle-photos";

const nextConfig = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

// Next.js 16 ha smesso di ottimizzare le immagini locali con una parte
// interrogativa nell'indirizzo, e non le salta: solleva un errore mentre
// disegna la pagina. Le foto importate passano tutte dal proxy, che una parte
// interrogativa ce l'ha per costruzione -- e la scheda di ogni veicolo
// importato rispondeva 500, mentre la compilazione del sito falliva.
describe("le foto importate restano ottimizzabili", () => {
  it("il proxy costruisce un indirizzo con parte interrogativa", () => {
    const proxied = mapVehicleImageUrlForDisplay("https://cdn.dealerk.it/dealer/images/800x0/33890/foto.jpeg");

    expect(proxied.startsWith("/api/image-proxy?")).toBe(true);
  });

  it("le foto dell'archivio non passano dal proxy e non hanno bisogno del permesso", () => {
    const storage = "https://progetto.supabase.co/storage/v1/object/sign/vehicle-images/foto.jpg";

    expect(mapVehicleImageUrlForDisplay(storage)).toBe(storage);
  });

  /**
   * "localPatterns" serviva al ridimensionatore di Next, che dal 04/09/2026
   * non entra piu' in gioco: le foto le ridimensiona /api/image-proxy, perche'
   * il servizio a consumo di Vercel aveva esaurito il pacchetto compreso nel
   * piano e tutte le foto del sito erano sparite in una volta.
   *
   * Il difetto che questo test impedisce e' il ritorno a quel giorno: basta
   * togliere il caricatore nostro perche' ogni foto ricominci a chiedere il
   * servizio a consumo.
   */
  it("il ridimensionamento resta nostro, non torna a Vercel", () => {
    expect(nextConfig).toContain('loader: "custom"');
    expect(nextConfig).toContain('loaderFile: "./src/lib/image-loader.ts"');
  });
});
