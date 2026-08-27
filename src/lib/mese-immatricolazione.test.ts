import { describe, expect, it } from "vitest";
import { leggiMeseImmatricolazione } from "@/lib/dealer-site-import";
import { formatRegistrationLabel } from "@/lib/vehicles";

/**
 * Le vetture importate dai siti delle concessionarie portavano solo l'anno:
 * dei 164 veicoli in produzione, 162 sono importati e nessuno aveva il mese.
 *
 * Il mese sulla pagina c'e', ma non nei dati leggibili dalle macchine --
 * "vehicleModelDate" dichiara soltanto l'anno. Sta scritto nella tabella delle
 * caratteristiche: "Immatricolazione 09/2018".
 */

const pagina = (corpo: string) => `<html><body>${corpo}</body></html>`;

describe("il mese si legge dalla pagina", () => {
  it("dall'etichetta della tabella caratteristiche", () => {
    const html = pagina("<dl><dt>Immatricolazione</dt><dd>01/2023</dd></dl>");
    expect(leggiMeseImmatricolazione(html, 2023)).toBe("01");
  });

  // Visto davvero su delorenziauto: "Immatricolazione 9/2018".
  it("anche quando il sito scrive il mese senza lo zero davanti", () => {
    expect(leggiMeseImmatricolazione(pagina("Immatricolazione 9/2018"), 2018)).toBe("09");
  });

  // Trovato provando su schede vere: un furgone del 1998 restava senza mese
  // perche' l'anno si accettava solo se cominciava per 20.
  it("anche per le vetture del secolo scorso", () => {
    expect(leggiMeseImmatricolazione(pagina("Immatricolazione 09/1998"), 1998)).toBe("09");
  });

  it("non lo inventa quando l'etichetta non c'e': sono le vetture mai targate", () => {
    expect(leggiMeseImmatricolazione(pagina("Chilometri 10 Km Alimentazione Benzina"), 2023)).toBeNull();
  });
});

/**
 * La trappola gia' pagata col prezzo e con le fotografie: la pagina di una
 * vettura contiene i dati di altre vetture -- quelle "simili" proposte in
 * fondo. Una data nel formato giusto non e' la data giusta.
 */
describe("non prende la data di un'altra automobile", () => {
  it("ignora le date che non sono attaccate alla parola Immatricolazione", () => {
    const html = pagina("Vetture simili 03/2021 05/2020 — Immatricolazione 10/2022 Chilometri 40.000");
    expect(leggiMeseImmatricolazione(html, 2022)).toBe("10");
  });

  // L'ultima rete: se l'anno accanto al mese non e' quello dei dati
  // strutturati, quella riga appartiene a un'altra vettura. Meglio nessun mese
  // che il mese di un'altra auto.
  it("scarta il mese se l'anno non combacia con quello dei dati strutturati", () => {
    expect(leggiMeseImmatricolazione(pagina("Immatricolazione 07/2015"), 2022)).toBeNull();
  });

  it("senza anno da confrontare si fida dell'etichetta, che e' gia' un'ancora", () => {
    expect(leggiMeseImmatricolazione(pagina("Immatricolazione 07/2015"), null)).toBe("07");
  });

  it("non legge dentro gli script, dove stanno i dati delle vetture consigliate", () => {
    const html = pagina('<script>var simili = "Immatricolazione 04/2020";</script>Chilometri 10');
    expect(leggiMeseImmatricolazione(html, 2020)).toBeNull();
  });
});

/**
 * Il punto per cui il mese non finisce dentro registration_date: quella e' una
 * data piena, e completarla richiederebbe un giorno che nessuno ha dichiarato.
 * Un "1 gennaio" inventato comparirebbe sulle schede come il giorno vero.
 */
describe("come si legge la data sulle schede", () => {
  it("mese e anno si mostrano insieme, senza inventare il giorno", () => {
    expect(formatRegistrationLabel({ registration_month: "09", year: 2018 })).toBe("09/2018");
    expect(formatRegistrationLabel({ registration_month: "9", year: "2018" })).toBe("09/2018");
  });

  it("senza mese resta il solo anno, come prima", () => {
    expect(formatRegistrationLabel({ registration_month: null, year: 2018 })).toBe("2018");
    expect(formatRegistrationLabel({ year: 2018 })).toBe("2018");
  });

  it("la data piena, quando c'e', continua a vincere sul mese", () => {
    expect(formatRegistrationLabel({ registration_date: "2019-03-15", registration_month: "09", year: 2019 })).toBe("15/03/2019");
  });

  // Il mese arriva da una pagina altrui: un valore fuori scala si ignora
  // invece di finire sulle schede.
  it("un mese impossibile non si mostra", () => {
    for (const mese of ["0", "13", "99", "abc", ""]) {
      expect(formatRegistrationLabel({ registration_month: mese, year: 2018 }), mese).toBe("2018");
    }
  });

  it("senza niente da mostrare non si inventa un'etichetta", () => {
    expect(formatRegistrationLabel({ registration_month: "09", year: null })).toBeNull();
  });
});
