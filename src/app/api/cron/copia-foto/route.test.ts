import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

/**
 * La rotta della copia delle foto. Le regole si provano in
 * `src/lib/copia-foto.test.ts` e `src/lib/copia-foto-giro.test.ts`, senza
 * rete; qui restano la serratura e due regole che il tipo non puo' esprimere.
 */

const originale = process.env.CRON_SECRET;
afterEach(() => {
  process.env.CRON_SECRET = originale;
});

describe("la serratura", () => {
  // Chi chiama questa rotta scrive con la chiave di servizio su ogni
  // concessionaria: senza segreto configurato non passa nessuno.
  it("senza segreto configurato non passa nessuno", async () => {
    delete process.env.CRON_SECRET;
    const risposta = await POST(new Request("http://x/api/cron/copia-foto", { method: "POST", headers: { "x-cron-secret": "" } }));
    expect(risposta.status).toBe(401);
  });

  it("con il segreto sbagliato non si passa", async () => {
    process.env.CRON_SECRET = "giusto";
    const risposta = await POST(new Request("http://x/api/cron/copia-foto", { method: "POST", headers: { "x-cron-secret": "sbagliato" } }));
    expect(risposta.status).toBe(401);
  });
});

describe("due regole scritte nel codice", () => {
  // Un commento a blocchi comincia a inizio riga o dopo uno spazio: la stessa
  // regola corretta il 25/09/2026 in sincronizzazioni-veicoli.test.ts, perche'
  // "*/*" dentro una stringa non apra un commento finto.
  const codice = readFileSync(resolve(process.cwd(), "src/app/api/cron/copia-foto/route.ts"), "utf8")
    .replace(/(^|\s)\/\*[\s\S]*?\*\//g, "$1")
    .replace(/^\s*\/\/.*$/gm, "");

  // Il proxy trasforma ogni fallimento in un 404: passando di li', la regola
  // "solo 404 e 410 vogliono dire non esiste" diventerebbe cieca.
  it("non scarica attraverso il proxy delle foto", () => {
    expect(codice).not.toContain("/api/image-proxy");
  });

  // Chiedendo webp e avif la rete di DealerK convertiva: il 25/09/2026 il primo
  // giro ha salvato in webp 177 copertine in vetrina, e le loro anteprime
  // social sono rimaste senza foto (il compositore legge JPEG e PNG).
  it("la copia chiede JPEG e PNG, non webp ne' avif", () => {
    const accetta = codice.match(/const ACCETTA = "([^"]*)"/)?.[1];
    expect(accetta).toBeTruthy();
    expect(accetta).not.toMatch(/webp|avif/i);
    expect(codice).toMatch(/Accept: ACCETTA/);
  });

  // La sincronizzazione puo' aver sostituito la foto mentre la copiavamo: una
  // scrittura senza questa condizione metterebbe la copia su una foto che non
  // c'e' piu'.
  it("ogni scrittura su una foto pretende che l'origine sia ancora quella letta", () => {
    const scritture = codice.match(/\.from\("vehicle_images"\)\s*\.update\(/g) ?? [];
    const condizionate = codice.match(/\.update\([\s\S]*?\)\s*\.eq\("id", (?:f|riga)\.id\)\s*\.(?:eq\("origine_url", f\.origine_url\)|is\("origine_url", null\))/g) ?? [];
    expect(scritture.length).toBeGreaterThan(0);
    expect(condizionate.length).toBe(scritture.length);
  });
});
