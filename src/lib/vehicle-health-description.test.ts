import { describe, expect, it } from "vitest";
import { evaluateVehicleHealth } from "@/lib/vehicle-health";

/** Una scheda completa, come arriva da un'importazione ben riuscita. */
function veicolo(sovrascrivi: Record<string, unknown> = {}) {
  return {
    brand: "Opel",
    model: "Corsa",
    version: "Blitz Edition 5 porte",
    year: 2023,
    registration_date: "2023-05-01",
    price: 20000,
    mileage: 10,
    fuel: "Benzina",
    transmission: "Manuale",
    status: "draft",
    published: false,
    description: null,
    vehicle_images: [{ image_url: "una.jpg" }, { image_url: "due.jpg" }, { image_url: "tre.jpg" }],
    ...sovrascrivi,
  } as never;
}

// I siti delle concessionarie spesso non pubblicano una descrizione
// commerciale: su centoventicinque vetture importate, novantuno avevano meno
// di ottanta caratteri. Chiederne una scritta a mano per ognuna vuol dire non
// pubblicarle mai.
describe("la descrizione consiglia, non impedisce", () => {
  it("un veicolo senza descrizione si puo' pubblicare", () => {
    const salute = evaluateVehicleHealth({ vehicle: veicolo({ description: null }) });

    expect(salute.publishable).toBe(true);
  });

  it("una descrizione breve non blocca", () => {
    const salute = evaluateVehicleHealth({ vehicle: veicolo({ description: "Ottima occasione." }) });

    expect(salute.publishable).toBe(true);
  });

  // Resta un segnale: un annuncio descritto vende meglio, e il punteggio lo
  // dice.
  it("ma resta segnalata, e pesa sul punteggio", () => {
    const senza = evaluateVehicleHealth({ vehicle: veicolo({ description: null }) });
    const con = evaluateVehicleHealth({ vehicle: veicolo({ description: "A".repeat(120) }) });

    expect(senza.issues.some((issue) => issue.code === "description")).toBe(true);
    expect(con.issues.some((issue) => issue.code === "description")).toBe(false);
    expect(senza.score).toBeLessThan(con.score);
  });

  // Le regole che restano: senza foto o senza chilometri un annuncio non e'
  // un annuncio, e quelle continuano a bloccare.
  it("le fotografie continuano a essere obbligatorie", () => {
    const salute = evaluateVehicleHealth({ vehicle: veicolo({ vehicle_images: [{ image_url: "una.jpg" }] }) });

    expect(salute.publishable).toBe(false);
    expect(salute.issues.some((issue) => issue.code === "images" && issue.blocksPublication)).toBe(true);
  });

  // Nota, trovata scrivendo questi test e non corretta qui perche' e' un
  // altro difetto: i chilometri sconosciuti (null) passano il controllo come
  // se fossero zero, perche' Number(null) fa 0. Sulla scheda pubblica quel
  // veicolo mostra un trattino, nel controllo di salute conta come "0 km".
  // Sono 14 vetture importate su 125.
  it("i chilometri sconosciuti oggi passano come zero (difetto noto)", () => {
    const salute = evaluateVehicleHealth({ vehicle: veicolo({ mileage: null }) });

    expect(salute.publishable).toBe(true);
    expect(salute.issues.some((issue) => issue.code === "mileage")).toBe(false);
  });
});
