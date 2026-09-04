import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pianoCambioStatoDiGruppo, riassumiLasciateStare } from "@/lib/cambio-stato-di-gruppo";

const parco = [
  { id: "bozza-1", status: "draft", published: false },
  { id: "bozza-2", status: "draft", published: false },
  { id: "online-1", status: "published", published: true },
  { id: "venduta", status: "sold", published: false },
  { id: "consegnata", status: "delivered", published: false },
  { id: "prenotata", status: "reserved", published: false },
  { id: "trattativa", status: "in_negotiation", published: false },
  { id: "archiviata", status: "archived", published: false },
  { id: "pronta", status: "ready_to_publish", published: false },
  { id: "da-controllare", status: "in_review", published: false },
];

describe("pianoCambioStatoDiGruppo", () => {
  it("pubblicando tocca solo le bozze", () => {
    const piano = pianoCambioStatoDiGruppo(parco, "published");
    expect(piano.daCambiare.map((v) => v.id)).toEqual(["bozza-1", "bozza-2"]);
    expect(piano.giaCosi).toBe(1);
  });

  it("mettendo in bozza tocca solo le pubblicate", () => {
    const piano = pianoCambioStatoDiGruppo(parco, "draft");
    expect(piano.daCambiare.map((v) => v.id)).toEqual(["online-1"]);
    expect(piano.giaCosi).toBe(2);
  });

  /**
   * Il difetto che questo impedisce, ed e' il motivo per cui il modulo
   * esiste: la macchina a stati consente il passaggio da "sold" a
   * "published" e a "draft" -- verificato chiamandola -- perche' e' pensata
   * per un comando dato su una vettura sola. Un bottone che ne tocca
   * duecento senza guardarle rimetterebbe in vendita le vendute, e mettendole
   * in bozza le toglierebbe dai conti delle vendite e dal conto economico,
   * che si fondano su status = 'sold'.
   */
  it("non tocca mai vendute, consegnate, prenotate, in trattativa, archiviate o da controllare", () => {
    const intoccabili = ["venduta", "consegnata", "prenotata", "trattativa", "archiviata", "da-controllare"];

    for (const verso of ["published", "draft"] as const) {
      const toccate = pianoCambioStatoDiGruppo(parco, verso).daCambiare.map((v) => v.id);
      for (const id of intoccabili) {
        expect(toccate).not.toContain(id);
      }
    }
  });

  it("dice quante ne lascia stare e in che stato", () => {
    const piano = pianoCambioStatoDiGruppo(parco, "published");
    const totaleLasciate = piano.lasciateStare.reduce((s, v) => s + v.quante, 0);
    expect(totaleLasciate).toBe(7);
    expect(riassumiLasciateStare(piano.lasciateStare)).toContain("1 ");
  });

  it("un parco vuoto non produce niente da fare", () => {
    const piano = pianoCambioStatoDiGruppo([], "published");
    expect(piano.daCambiare).toEqual([]);
    expect(piano.giaCosi).toBe(0);
    expect(riassumiLasciateStare(piano.lasciateStare)).toBeNull();
  });

  /**
   * Una riga vecchia puo' avere status nullo e il solo flag published: e'
   * come sono nate le prime importazioni. Deve contare come bozza, non
   * finire fra le intoccabili.
   */
  it("una riga senza stato scritto vale come bozza", () => {
    const piano = pianoCambioStatoDiGruppo([{ id: "vecchia", status: null, published: false }], "published");
    expect(piano.daCambiare.map((v) => v.id)).toEqual(["vecchia"]);
  });
});

describe("la pagina del parco auto usa questa regola e non una sua", () => {
  const pagina = readFileSync("src/components/vehicles/vehicles-management-page.tsx", "utf8");

  /**
   * Il comando di gruppo deve passare da qui. Se un domani qualcuno filtrasse
   * gli stati a mano dentro la pagina, le protezioni provate qui sopra --
   * niente vendute, niente prenotate, niente "da controllare" -- resterebbero
   * scritte e inutilizzate, e nessuno se ne accorgerebbe finche' una vettura
   * venduta non torna sul marketplace.
   */
  it("chiama pianoCambioStatoDiGruppo", () => {
    expect(pagina).toContain("pianoCambioStatoDiGruppo(righe, verso)");
  });

  it("offre i due versi, pubblicazione e bozza", () => {
    expect(pagina).toContain('handleCambiaStatoDiTutti("published")');
    expect(pagina).toContain('handleCambiaStatoDiTutti("draft")');
  });

  /**
   * Una scrittura sola su tutte le righe verrebbe rifiutata per intero
   * quando scatta il tetto del piano, e non pubblicherebbe nessuna vettura:
   * il controllo del database e' per riga. Per questo si aggiorna una scheda
   * per volta e ci si ferma quando il posto finisce.
   */
  it("si ferma quando il piano non ha piu' posto, invece di saltare la riga", () => {
    expect(pagina).toContain('erroreScrittura.message.includes("limite di")');
  });
});
