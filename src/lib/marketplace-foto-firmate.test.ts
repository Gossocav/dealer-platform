import { describe, expect, it } from "vitest";
import { indirizzoStabileFoto, resolveVehicleImageUrl } from "@/lib/marketplace-foto-firmate";

/**
 * Cosa impedisce questo file.
 *
 * **Il difetto, misurato il 5 settembre 2026.** L'indirizzo di ogni fotografia
 * conteneva un lasciapassare che scade dopo sessanta minuti. Provato
 * manomettendolo: risponde 404. Per chi guarda non si vede -- apre la pagina e
 * la foto e' li' -- ma un motore di ricerca archivia l'indirizzo oggi e lo
 * ripassa fra una settimana, trova un 404, e impara che le nostre fotografie
 * non sono affidabili. Peggio: l'indirizzo cambiava a ogni rigenerazione della
 * pagina, quindi Google non ne avrebbe mai visto due volte uno uguale, e non
 * avrebbe mai potuto tenerne uno in archivio.
 *
 * Adesso la pagina dichiara il percorso e la firma se la procura il proxy al
 * momento di servire. Questi test guardano l'indirizzo che finisce nella
 * pagina: deve essere sempre lo stesso e non deve contenere nessuna scadenza.
 */

const PERCORSO = "299d3fd8-97ac-4838-8958-2e9017052b33/dc704ffc-6437-4a5b-953c-51771938d676/1785573712546-1-FOTO.jpg";

describe("l'indirizzo pubblico di una fotografia", () => {
  it("non contiene nessun lasciapassare che possa scadere", async () => {
    const indirizzo = await resolveVehicleImageUrl(PERCORSO);

    expect(indirizzo).not.toBeNull();
    expect(indirizzo).not.toContain("token=");
    expect(indirizzo).not.toContain("/object/sign/");
  });

  it("e' lo stesso a ogni richiesta, cosi' Google puo' tenerlo in archivio", async () => {
    const primo = await resolveVehicleImageUrl(PERCORSO);
    const secondo = await resolveVehicleImageUrl(PERCORSO);

    expect(primo).toBe(secondo);
    expect(primo).toBe(indirizzoStabileFoto(PERCORSO));
  });

  it("passa dal nostro proxy, dichiarando il percorso e non l'indirizzo firmato", async () => {
    const indirizzo = await resolveVehicleImageUrl(PERCORSO);

    expect(indirizzo?.startsWith("/api/image-proxy?foto=")).toBe(true);
    expect(decodeURIComponent(indirizzo!.split("foto=")[1])).toBe(PERCORSO);
  });

  it("riconosce il percorso anche quando nel database e' salvato come indirizzo firmato intero", async () => {
    const salvatoFirmato = `https://esempio.supabase.co/storage/v1/object/sign/vehicle-images/${PERCORSO}?token=una-firma-vecchia`;

    const indirizzo = await resolveVehicleImageUrl(salvatoFirmato);

    expect(indirizzo).toBe(indirizzoStabileFoto(PERCORSO));
    expect(indirizzo).not.toContain("una-firma-vecchia");
  });

  it("riconosce il percorso anche quando e' salvato come indirizzo pubblico", async () => {
    const salvatoPubblico = `https://esempio.supabase.co/storage/v1/object/public/vehicle-images/${PERCORSO}`;

    expect(await resolveVehicleImageUrl(salvatoPubblico)).toBe(indirizzoStabileFoto(PERCORSO));
  });

  it("le foto che vivono altrove continuano a passare dal proxy con il loro indirizzo", async () => {
    const esterna = "https://www.concessionaria-esempio.it/foto/auto-123.jpg";

    const indirizzo = await resolveVehicleImageUrl(esterna);

    expect(indirizzo?.startsWith("/api/image-proxy?url=")).toBe(true);
    expect(indirizzo).not.toContain("foto=");
  });

  it("un valore vuoto non produce nessun indirizzo", async () => {
    expect(await resolveVehicleImageUrl("")).toBeNull();
    expect(await resolveVehicleImageUrl(null)).toBeNull();
    expect(await resolveVehicleImageUrl(undefined)).toBeNull();
  });

  it("un percorso con caratteri da codificare non rompe l'indirizzo", async () => {
    const conSpazio = "cartella/veicolo/foto con spazio.jpg";

    const indirizzo = await resolveVehicleImageUrl(conSpazio);

    expect(indirizzo).not.toContain(" ");
    expect(decodeURIComponent(indirizzo!.split("foto=")[1])).toBe(conSpazio);
  });
});
