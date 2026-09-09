import { describe, expect, it } from "vitest";
import { righeSchedaTecnica } from "@/lib/scheda-tecnica";

/**
 * Cosa impedisce questo file.
 *
 * **Le righe vuote, misurate in produzione il 09/09/2026.** La scheda tecnica
 * disegnava tutte le sue dieci righe, e quelle senza dato mostravano un
 * trattino: due per scheda in media, e "Interni" era vuota su dodici schede su
 * dodici. Un trattino non e' un dato, ed e' testo *identico* su ogni scheda:
 * aggiungerne rende le pagine piu' simili fra loro, che e' il problema per cui
 * Google ne indicizza una su cinque invece di tutte.
 *
 * **I campi che c'erano e non si vedevano.** Carrozzeria, posti e garanzia
 * stavano nel database ed erano gia' letti dalla pagina, che poi non li
 * mostrava. La carrozzeria e' quella che pesa: e' una parola per cui la gente
 * cerca.
 *
 * **La riga che non va aggiunta.** "Disponibilita'" sta nel database, viene
 * letta insieme alle altre, e non la scrive nessuno in nessun punto del
 * progetto. Aggiungerla sembrerebbe un miglioramento e sarebbe una riga vuota
 * per sempre. Il test la nomina perche' fra sei mesi la tentazione tornera'.
 */

const completo = {
  brand: "Hyundai",
  model: "Santa Fe",
  version: "Sline Business",
  traction: "Integrale",
  engine_size: "2199",
  power_kw: 80,
  body_type: "SUV",
  doors: 5,
  seats: 7,
  emission_class: "Euro 6",
  color: "Giallo",
  interior_type: "Pelle",
  warranty: "24 mesi",
};

function etichette(veicolo: Parameters<typeof righeSchedaTecnica>[0]) {
  return righeSchedaTecnica(veicolo).map((riga) => riga.label);
}

describe("la scheda tecnica di un annuncio", () => {
  it("mostra tutto quello che c'e', quando c'e' tutto", () => {
    expect(etichette(completo)).toEqual([
      "Marca",
      "Modello",
      "Versione",
      "Trazione",
      "Cilindrata",
      "Potenza kW",
      "Carrozzeria",
      "Porte",
      "Posti",
      "Classe Euro",
      "Colore",
      "Interni",
      "Garanzia",
    ]);
  });

  it("mostra i tre campi che il database aveva e la pagina non mostrava", () => {
    // Il difetto: erano nella query e non nella tabella.
    expect(etichette(completo)).toContain("Carrozzeria");
    expect(etichette(completo)).toContain("Posti");
    expect(etichette(completo)).toContain("Garanzia");
  });

  it("non inventa la riga che nessuno riempie", () => {
    // "availability" esiste nel database e nella query, e nessun punto del
    // progetto la scrive. Una riga sempre vuota e' peggio di una riga assente.
    expect(etichette({ ...completo })).not.toContain("Disponibilita'");
    expect(etichette({ ...completo })).not.toContain("Disponibilità");
  });

  it("tace sui campi che quel veicolo non ha, invece di mettere un trattino", () => {
    const scarno = { brand: "Fiat", model: "Panda", interior_type: null, warranty: null, seats: null };

    const righe = righeSchedaTecnica(scarno);

    expect(righe.map((r) => r.label)).toEqual(["Marca", "Modello"]);
    expect(righe.every((r) => r.value !== "-")).toBe(true);
  });

  it("toglie 'Interni' quando e' vuota, che in produzione era sempre", () => {
    expect(etichette({ ...completo, interior_type: null })).not.toContain("Interni");
    expect(etichette({ ...completo, interior_type: "   " })).not.toContain("Interni");
  });

  it("due veicoli diversi portano righe diverse, e cosi' si distinguono", () => {
    // E' il punto di tutta la modifica: prima le due schede avevano le stesse
    // dieci righe, alcune con un trattino, e si somigliavano di piu'.
    const conGaranzia = righeSchedaTecnica({ ...completo, warranty: "24 mesi", seats: null });
    const conPosti = righeSchedaTecnica({ ...completo, warranty: null, seats: 7 });

    expect(conGaranzia.map((r) => r.label)).toContain("Garanzia");
    expect(conGaranzia.map((r) => r.label)).not.toContain("Posti");
    expect(conPosti.map((r) => r.label)).toContain("Posti");
    expect(conPosti.map((r) => r.label)).not.toContain("Garanzia");
  });

  it("uno zero e' un dato, non un vuoto", () => {
    // Un'auto con zero km percorsi, o una potenza dichiarata zero, non deve
    // sparire dalla tabella come se il campo non fosse stato compilato.
    expect(etichette({ brand: "Fiat", model: "Panda", power_kw: 0 })).toContain("Potenza kW");
  });
});
