import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FASCE,
  ancoraInPiazzale,
  capitaleFermo,
  fasciaDi,
  giaVendute,
  giorniPerVendere,
  giorniTra,
  oggiIso,
  quadroDelPiazzale,
  quadroDelVenduto,
  type VetturaGiacenza,
} from "@/lib/giacenza";

function vettura(parziale: Partial<VetturaGiacenza> & { vehicleId: string }): VetturaGiacenza {
  return {
    etichetta: "Peugeot 2008",
    targa: "AB123CD",
    stato: "published",
    purchaseDate: null,
    saleDate: null,
    prezzo: null,
    ...parziale,
  };
}

describe("i giorni fra due date", () => {
  it("conta i giorni pieni", () => {
    expect(giorniTra("2026-01-01", "2026-01-31")).toBe(30);
  });

  it("un anno bisestile lo conta giusto", () => {
    expect(giorniTra("2024-02-01", "2024-03-01")).toBe(29);
  });

  // Contando le ore locali, la notte in cui scatta l'ora legale ne vale 23 e
  // la divisione perde un giorno: a fine marzo tutte le giacenze sarebbero
  // state di un giorno piu' corte del vero, per sempre.
  it("il cambio dell'ora non fa perdere un giorno", () => {
    expect(giorniTra("2026-03-28", "2026-03-30")).toBe(2);
    expect(giorniTra("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("una data che manca non vale zero: vale niente", () => {
    expect(giorniTra(null, "2026-01-31")).toBeNull();
    expect(giorniTra("2026-01-01", null)).toBeNull();
    expect(giorniTra("", "2026-01-31")).toBeNull();
    expect(giorniTra("non una data", "2026-01-31")).toBeNull();
  });
});

describe("le fasce chieste: 30/60/90/120/150", () => {
  it("sono sei e coprono tutto senza buchi", () => {
    expect(FASCE.map((f) => f.id)).toEqual(["0-30", "31-60", "61-90", "91-120", "121-150", "oltre-150"]);
  });

  // Un confine che cade fra due fasce fa sparire una vettura dal totale senza
  // che nessuno se ne accorga: il grafico conta meno auto di quante ce ne
  // siano, e la somma delle barre non torna con il parco.
  it("i confini sono compresi, e nessun giorno resta fuori", () => {
    for (let giorni = 0; giorni <= 400; giorni += 1) {
      expect(fasciaDi(giorni), `${giorni} giorni fuori da ogni fascia`).toBeTruthy();
    }
    expect(fasciaDi(30)).toBe("0-30");
    expect(fasciaDi(31)).toBe("31-60");
    expect(fasciaDi(150)).toBe("121-150");
    expect(fasciaDi(151)).toBe("oltre-150");
    expect(fasciaDi(2000)).toBe("oltre-150");
  });
});

describe("cosa e' fermo e cosa e' venduto", () => {
  const parco = [
    vettura({ vehicleId: "1", stato: "draft" }),
    vettura({ vehicleId: "2", stato: "published" }),
    vettura({ vehicleId: "3", stato: "reserved" }),
    vettura({ vehicleId: "4", stato: "sold" }),
    vettura({ vehicleId: "5", stato: "delivered" }),
    vettura({ vehicleId: "6", stato: "archived" }),
  ];

  // Una bozza e' comprata e pagata come le altre: e' ferma in piazzale anche
  // se l'annuncio non e' ancora online. Escluderla direbbe che il capitale
  // fermo e' meno di quello che e'.
  it("una bozza e' in piazzale quanto una pubblicata", () => {
    expect(ancoraInPiazzale(parco).map((v) => v.vehicleId)).toEqual(["1", "2", "3"]);
  });

  it("venduta e consegnata contano come vendute", () => {
    expect(giaVendute(parco).map((v) => v.vehicleId)).toEqual(["4", "5"]);
  });

  it("l'archiviata non sta ne' di qua ne' di la'", () => {
    expect([...ancoraInPiazzale(parco), ...giaVendute(parco)].map((v) => v.vehicleId)).not.toContain("6");
  });
});

describe("il quadro del piazzale", () => {
  const oggi = "2026-09-01";
  const parco = [
    vettura({ vehicleId: "recente", purchaseDate: "2026-08-20" }), // 12 giorni
    vettura({ vehicleId: "media", purchaseDate: "2026-06-15" }), // 78 giorni
    vettura({ vehicleId: "vecchia", purchaseDate: "2026-01-10" }), // 234 giorni
    vettura({ vehicleId: "senza-data" }),
    vettura({ vehicleId: "venduta", stato: "sold", purchaseDate: "2026-01-01", saleDate: "2026-02-01" }),
  ];

  const quadro = quadroDelPiazzale(parco, oggi);

  it("mette ogni vettura nella sua fascia", () => {
    const dentro = (id: string) => quadro.fasce.find((f) => f.vetture.some((v) => v.vehicleId === id))?.id;
    expect(dentro("recente")).toBe("0-30");
    expect(dentro("media")).toBe("61-90");
    expect(dentro("vecchia")).toBe("oltre-150");
  });

  // Il difetto che questo impedisce: un'auto senza data di acquisto contata
  // come "comprata oggi" finirebbe nella prima fascia e riempirebbe di verde
  // un piazzale fermo. E' lo stesso errore gia' pagato due volte su questa
  // piattaforma -- un numero inventato messo accanto a numeri veri.
  it("senza data di acquisto sta fuori dal grafico, e si dice", () => {
    expect(quadro.senzaData.map((v) => v.vehicleId)).toEqual(["senza-data"]);
    expect(quadro.fasce.flatMap((f) => f.vetture).map((v) => v.vehicleId)).not.toContain("senza-data");
    expect(quadro.totale).toBe(3);
  });

  it("le vendute non stanno nel piazzale", () => {
    expect(quadro.fasce.flatMap((f) => f.vetture).map((v) => v.vehicleId)).not.toContain("venduta");
  });

  it("dentro la fascia si guarda prima quella ferma da piu' tempo", () => {
    const piazzale = quadroDelPiazzale(
      [
        vettura({ vehicleId: "meno", purchaseDate: "2026-08-25" }),
        vettura({ vehicleId: "piu", purchaseDate: "2026-08-10" }),
      ],
      oggi
    );
    expect(piazzale.fasce[0].vetture.map((v) => v.vehicleId)).toEqual(["piu", "meno"]);
  });

  // Una data di acquisto nel futuro e' una battitura sbagliata (2027 al posto
  // di 2026). Contarla come zero giorni la nasconderebbe nella fascia buona,
  // dove nessuno andra' mai a cercarla.
  it("una data nel futuro si segnala invece di contarla zero", () => {
    const storto = quadroDelPiazzale([vettura({ vehicleId: "futura", purchaseDate: "2027-01-01" })], oggi);
    expect(storto.incoerenti.map((v) => v.vehicleId)).toEqual(["futura"]);
    expect(storto.totale).toBe(0);
    expect(storto.fasce.every((f) => f.vetture.length === 0)).toBe(true);
  });

  it("la media si fa solo su chi ha il dato", () => {
    expect(quadro.giorniMedi).toBe(Math.round((12 + 78 + 234) / 3));
    expect(quadro.giorniMassimi).toBe(234);
  });

  it("senza nessun dato non inventa una media", () => {
    const vuoto = quadroDelPiazzale([vettura({ vehicleId: "solo-senza-data" })], oggi);
    expect(vuoto.giorniMedi).toBeNull();
    expect(vuoto.giorniMassimi).toBeNull();
  });
});

describe("il quadro del venduto", () => {
  const parco = [
    vettura({ vehicleId: "svelta", stato: "sold", purchaseDate: "2026-01-01", saleDate: "2026-01-20" }),
    vettura({ vehicleId: "lenta", stato: "delivered", purchaseDate: "2026-01-01", saleDate: "2026-07-01" }),
    vettura({ vehicleId: "senza-vendita", stato: "sold", purchaseDate: "2026-01-01" }),
    vettura({ vehicleId: "senza-acquisto", stato: "sold", saleDate: "2026-07-01" }),
  ];

  const quadro = quadroDelVenduto(parco);

  it("conta dall'acquisto alla vendita, non fino a oggi", () => {
    expect(giorniPerVendere(parco[0])).toBe(19);
    expect(quadro.fasce.find((f) => f.id === "0-30")?.vetture.map((v) => v.vehicleId)).toEqual(["svelta"]);
    expect(quadro.fasce.find((f) => f.id === "oltre-150")?.vetture.map((v) => v.vehicleId)).toEqual(["lenta"]);
  });

  // Una venduta a cui manca una delle due date non e' una vendita immediata:
  // e' una vendita di cui non si sa la durata.
  it("se manca una delle due date il conto non si chiude", () => {
    expect(quadro.senzaData.map((v) => v.vehicleId)).toEqual(["senza-vendita", "senza-acquisto"]);
    expect(quadro.totale).toBe(2);
  });

  it("venduta prima di essere comprata e' un errore, e si vede", () => {
    const storto = quadroDelVenduto([
      vettura({ vehicleId: "impossibile", stato: "sold", purchaseDate: "2026-07-01", saleDate: "2026-01-01" }),
    ]);
    expect(storto.incoerenti.map((v) => v.vehicleId)).toEqual(["impossibile"]);
  });
});

describe("il capitale fermo", () => {
  it("somma i prezzi che ci sono", () => {
    const vetture = quadroDelPiazzale(
      [
        vettura({ vehicleId: "a", purchaseDate: "2026-08-25", prezzo: 12_000 }),
        vettura({ vehicleId: "b", purchaseDate: "2026-08-26", prezzo: 8_000 }),
      ],
      "2026-09-01"
    ).fasce[0].vetture;
    expect(capitaleFermo(vetture)).toBe(20_000);
  });

  it("senza nessun prezzo non dice zero euro", () => {
    const vetture = quadroDelPiazzale([vettura({ vehicleId: "a", purchaseDate: "2026-08-25" })], "2026-09-01").fasce[0]
      .vetture;
    expect(capitaleFermo(vetture)).toBeNull();
  });
});

describe("oggi", () => {
  it("si scrive come lo scrive il database", () => {
    expect(oggiIso(new Date(2026, 8, 1))).toBe("2026-09-01");
    expect(oggiIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

// La data di acquisto e' un dato d'ufficio: sta nella tabella che il pubblico
// non puo' leggere, non fra le colonne del veicolo che finiscono nel
// marketplace. Se un giorno qualcuno la spostasse su `vehicles` per comodita',
// diventerebbe leggibile con la sola chiave del sito.
describe("la data di acquisto resta un dato riservato", () => {
  it("vive nel conto economico, non nell'annuncio", () => {
    const migrazione = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260831010000_conto_economico_veicolo.sql"),
      "utf8"
    );
    expect(migrazione).toContain("purchase_date date");
    expect(migrazione).toContain("revoke all on public.vehicle_economics from anon");
  });

  it("la pagina della giacenza la legge da li'", () => {
    const pagina = readFileSync(resolve(process.cwd(), "src/components/dashboard/stock-age-page.tsx"), "utf8");
    expect(pagina).toContain("vehicle_economics(purchase_date, sale_date)");
    expect(pagina).toContain('.eq("dealer_id", dealerId)');
  });
});
