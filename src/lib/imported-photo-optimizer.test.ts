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

  it("la configurazione dichiara il percorso del proxy fra quelli ammessi", () => {
    expect(nextConfig).toContain("localPatterns");
    expect(nextConfig).toContain('{ pathname: "/api/image-proxy" }');
  });

  // Dichiarare "localPatterns" ribalta la regola per tutte le immagini
  // locali: da "tutto permesso" a "solo cio' che e' elencato". Senza questa
  // riga, il permesso dato alle foto importate ne toglierebbe a tutte le
  // altre.
  it("il resto delle immagini locali resta ammesso", () => {
    expect(nextConfig).toContain('{ pathname: "/**", search: "" }');
  });
});
