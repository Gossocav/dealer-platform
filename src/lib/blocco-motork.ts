/**
 * Il blocco dati che i siti su MotorK pubblicano dentro ogni scheda.
 *
 * **Cos'e'.** Accanto ai dati strutturati che gia' leggiamo, quelle pagine
 * contengono un oggetto JSON pensato per la pubblicita' (`dataLayer.push`) che
 * porta dentro molto piu' di quanto l'annuncio mostri. La sincronizzazione
 * **scarica gia' quelle pagine**: leggerlo non costa **nessuna richiesta in
 * piu'**.
 *
 * **Cosa ci abbiamo trovato**, misurato il 14/09/2026 su 126 schede dei tre
 * siti collegati. I siti non pubblicano tutti la stessa cosa, e la differenza
 * e' netta:
 *
 *     ponginibbigroup.it   blocco "ricco", 341 campi   80 schede su 80
 *     autogepy.it          blocco "ricco", 343 campi   25 schede su 25
 *     delorenziauto.it     blocco "magro", 4 campi     21 schede su 21
 *
 * Il blocco ricco porta immatricolazione, regime IVA, categoria e data
 * d'ingresso in piazzale -- e **non** porta la targa. Il blocco magro porta
 * targa e telaio -- e **nient'altro**. Sono due canali indipendenti: un
 * concessionario puo' pubblicare l'uno, l'altro, tutti e due o nessuno, e
 * **nessuna vettura resta fuori dalla vetrina per quello che manca**.
 *
 * **Questo file non parla ne' con la rete ne' con il database**, come
 * `dealer-site-import.ts`: si puo' provare su pagine vere senza rischi.
 */

import { chiaveDellaFoto } from "@/lib/identita-foto";
import { esitoTarga } from "@/lib/targa";
import { telaioDaSalvare } from "@/lib/telaio";

/** Le fonti di un dato letto qui. Chi lo scrive le riporta in `origine_dati`. */
export type QualitaDato =
  /** Il sito lo dichiara come dato. */
  | "sito"
  /**
   * Il sistema del concessionario l'ha riempito da solo. Vale meno, e non si
   * propone mai come dato certo.
   */
  | "dedotto";

export type DataDiIngresso = {
  /** Il giorno, come lo scrive il database: 2026-02-12. */
  giorno: string;
  qualita: QualitaDato;
};

export type BloccoMotork = {
  /** Quanti campi aveva il blocco: dice se e' quello ricco o quello magro. */
  campi: number;
  /** La data di prima immatricolazione, "2022-01-01". */
  immatricolazione: string | null;
  /** 'esposta' | 'margine', oppure null se il sito non lo dice. */
  regimeIva: "esposta" | "margine" | null;
  /** Come il **sistema** classifica la vettura: USED, KM0, NEW. */
  categoria: string | null;
  /** I chilometri come numero pulito. Il blocco magro li scrive "12.500 Km". */
  chilometri: number | null;
  /** Da quando e' in piazzale, e se il sito lo dichiara o l'ha dedotto. */
  ingresso: DataDiIngresso | null;
  /** Solo dal blocco magro, e solo se ha la forma di una targa italiana. */
  targa: string | null;
  telaio: string | null;
};

type Grezzo = Record<string, unknown>;

const testo = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

const numero = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // Il blocco magro scrive "12.500 Km": si prendono le sole cifre.
  const cifre = String(v ?? "").replace(/[^\d]/g, "");
  if (!cifre) return null;
  const n = Number(cifre);
  return Number.isFinite(n) ? n : null;
};

/**
 * Tutti i blocchi della pagina che contengono un veicolo.
 *
 * Una pagina puo' averne piu' d'uno -- lo stesso veicolo descritto due volte
 * per due strumenti diversi -- e in teoria potrebbe contenere i dati di
 * un'**altra** vettura. Per questo non si prende il primo che capita: vedi
 * `bloccoDellaScheda`.
 */
function blocchiVeicolo(html: string): Grezzo[] {
  const trovati: Grezzo[] = [];
  const gia = new Set<string>();

  const aggiungi = (crudo: string) => {
    if (gia.has(crudo)) return;
    try {
      const o = JSON.parse(crudo) as Grezzo;
      if (o && typeof o === "object" && o.vehicleData) {
        gia.add(crudo);
        trovati.push(o);
      }
    } catch {
      // Non e' JSON valido: sulla stessa pagina ce ne sono altri che lo sono.
    }
  };

  for (const m of html.matchAll(/\{[^{]*?"vehicleData"\s*:\s*\{[\s\S]*?\}\s*\}/g)) aggiungi(m[0]);
  for (const m of html.matchAll(/dataLayer\.push\(\s*(\{[\s\S]*?\})\s*\)\s*;/g)) aggiungi(m[1]);

  return trovati;
}

/**
 * Il blocco che parla **di questa scheda**, e non di un'altra vettura.
 *
 * **Perche' e' scritto cosi'.** La targa e' una chiave: attribuirla alla
 * vettura sbagliata sarebbe peggio che non averla. Si prende quindi solo il
 * blocco il cui identificativo coincide con quello della scheda che si sta
 * leggendo -- `vehicleId` o `dynx_itemid` -- e mai il primo della pagina.
 *
 * Misurato il 14/09/2026 su 126 pagine: mai piu' di un blocco per pagina, e
 * **zero** pagine con i dati di un'altra vettura. Il controllo resta lo stesso:
 * il giorno che un sito metta due vetture nella stessa pagina, e' l'unica cosa
 * che impedisce di scambiarle.
 */
function bloccoDellaScheda(html: string, sourceId: string): Grezzo | null {
  const miei = blocchiVeicolo(html).filter((b) => {
    const dati = (b.vehicleData ?? {}) as Grezzo;
    return String(dati.vehicleId ?? "") === sourceId || String(b.dynx_itemid ?? "") === sourceId;
  });

  if (miei.length === 0) return null;

  // Se un sito ne pubblicasse due per la stessa vettura, si uniscono: sono
  // descrizioni della stessa cosa, e nessuna delle due e' piu' autorevole.
  return Object.assign({}, ...miei.map((b) => b.vehicleData as Grezzo)) as Grezzo;
}

/** Da "2022-01-01T00:00:00Z" a "2022-01-01". Null se non e' una data vera. */
function giorno(valore: unknown): string | null {
  const s = testo(valore);
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Il regime IVA, dal campo `vat`.
 *
 * **Lo zero e' un dato, non un vuoto**: vuol dire regime del margine. La prova
 * che il campo e' affidabile sta nell'incrocio con la categoria, misurato il
 * 14/09/2026 su 80 schede: **17 km 0 su 17** risultano a IVA esposta, e una
 * km 0 lo e' sempre. Se fosse spazzatura non produrrebbe questa regolarita'.
 *
 * Il campo assente e' un'altra cosa ancora: il sito non lo dice, e la risposta
 * giusta e' "non lo so".
 */
function regimeIva(dati: Grezzo): "esposta" | "margine" | null {
  if (!("vat" in dati)) return null;
  const v = dati.vat;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? "esposta" : "margine";
}

/**
 * La data d'ingresso in piazzale, e quanto ci si puo' credere.
 *
 * **Dichiarata o dedotta si riconoscono**, e la differenza non e' teorica:
 * quando `enteredInStockDate` coincide **al secondo** con `dateCreated`, il
 * fornitore l'ha riempita da solo con il momento in cui la scheda e' nata.
 *
 * La prova che quella dichiarata dice davvero il piazzale sta in un
 * comportamento che nessuna data di sistema potrebbe imitare, misurato il
 * 14/09/2026 su ponginibbigroup.it: le **km 0 entrano 5 giorni PRIMA** di
 * essere immatricolate -- il concessionario riceve l'auto e poi la targa --
 * mentre le **usate entrano 1.400 giorni DOPO**. Su autogepy.it, dove le due
 * date coincidono sempre, quella firma sparisce.
 */
function dataDiIngresso(dati: Grezzo): DataDiIngresso | null {
  const ingresso = dati.enteredInStockDate;
  if (ingresso === null || ingresso === undefined || ingresso === "") return null;

  const t = Number(ingresso);
  if (!Number.isFinite(t) || t <= 0) return null;

  const creazione = Number(dati.dateCreated);
  // Meno di un minuto di distanza vuol dire che l'ha scritta il sistema.
  const dedotta = Number.isFinite(creazione) && Math.abs(t - creazione) < 60_000;

  return { giorno: new Date(t).toISOString().slice(0, 10), qualita: dedotta ? "dedotto" : "sito" };
}

/**
 * Una data d'ingresso che non sta in piedi non si scrive.
 *
 * **Un'usata non puo' entrare in piazzale prima di essere stata
 * immatricolata**: se succede, quella data e' sbagliata a monte e scriverla
 * vorrebbe dire mostrare al concessionario una giacenza inventata. Misurato il
 * 14/09/2026: capita su **6 usate su 63** di ponginibbigroup.it.
 *
 * Per una **km 0** e' invece normale il contrario, ed e' la sua firma: la
 * riceve e la immatricola dopo, in media cinque giorni. Si lascia percio' un
 * margine di due mesi, che copre il caso vero senza lasciar passare quello
 * assurdo -- su Ponginibbi gli scarti veri arrivavano a 680 giorni.
 */
export function ingressoAttendibile(
  ingresso: DataDiIngresso | null,
  immatricolazione: string | null,
  categoria: string | null,
): boolean {
  if (!ingresso) return false;
  if (!immatricolazione) return true;

  const scarto = (Date.parse(ingresso.giorno) - Date.parse(immatricolazione)) / 86_400_000;
  if (!Number.isFinite(scarto)) return true;

  const km0 = String(categoria ?? "").toUpperCase().includes("KM0");
  return scarto >= (km0 ? -60 : -31);
}

/**
 * Le foto che il blocco di **questa** scheda dichiara sue, come identita'
 * (`chiaveDellaFoto`: cartella e nome del file, senza misura).
 *
 * Tre risposte, e non si confondono:
 * - `null`: la pagina non ha un blocco che parli di questa vettura. Non si sa,
 *   e chi chiama fa come prima.
 * - insieme vuoto: il blocco c'e' e non dichiara nessuna foto. Su De Lorenzi
 *   e' il caso delle auto senza foto: al posto dell'elenco c'e' solo il
 *   segnaposto di DealerK (`/cars/placeholder/`).
 * - le foto dell'elenco `vehicleData.imageList`.
 *
 * **Perche' serve.** Il lettore riconosce le foto dell'auto perche' la pagina
 * le pubblica in piu' misure. Su ponginibbigroup.it anche le 24 foto del
 * carosello delle altre auto compaiono in piu' misure, e passavano: un'auto con
 * meno di venti foto proprie si riempiva di foto altrui (la Citroen Ami, 2 sue
 * e 18 di altre auto, 25/09/2026). L'elenco del blocco e' legato alla scheda
 * dall'identificativo, come la targa. Misurato quel giorno su 294 pagine dei
 * tre siti: ogni pagina ha il blocco della sua scheda; dove l'elenco c'e',
 * contiene tutte le foto che il lettore prende, nello stesso ordine, e su
 * Ponginibbi nessuna di quelle del carosello.
 */
export function fotoDelBlocco(html: string, sourceId: string): Set<string> | null {
  const dati = bloccoDellaScheda(html, sourceId);
  if (!dati) return null;

  const dichiarate = new Set<string>();
  const elenco = Array.isArray(dati.imageList) ? dati.imageList : [];
  for (const voce of elenco) {
    if (!voce || typeof voce !== "object") continue;
    // Ogni voce porta la stessa foto in piu' misure: ne basta una qualsiasi,
    // l'identita' non dipende dalla misura.
    for (const valore of Object.values(voce as Grezzo)) {
      if (typeof valore === "string" && valore.includes("/dealer/datafiles/vehicle/images/")) {
        dichiarate.add(chiaveDellaFoto(valore));
      }
    }
  }
  return dichiarate;
}

/**
 * Legge il blocco di una scheda. `null` quando la pagina non ne ha uno che
 * parli di questa vettura -- che non e' un guasto: il sito di De Lorenzi non
 * pubblica il blocco ricco, e va benissimo cosi'.
 */
export function leggiBloccoMotork(html: string, sourceId: string): BloccoMotork | null {
  const dati = bloccoDellaScheda(html, sourceId);
  if (!dati) return null;

  const immatricolazione = giorno(dati.registrationDate);
  const categoria = testo(dati.type);
  const ingresso = dataDiIngresso(dati);

  // La targa arriva solo dal blocco magro, e solo se e' una targa: su 62
  // lette il 14/09/2026, due valevano "XXX" e "XXXX". Una targa sbagliata e'
  // peggio di una mancante.
  const esito = esitoTarga(dati.numberPlate);

  return {
    campi: Object.keys(dati).length,
    immatricolazione,
    regimeIva: regimeIva(dati),
    categoria,
    chilometri: numero(dati.km),
    ingresso: ingressoAttendibile(ingresso, immatricolazione, categoria) ? ingresso : null,
    targa: esito.stato === "valida" ? esito.targa : null,
    // Stessa regola della targa: la forma sta in `src/lib/telaio.ts`, e un
    // segnaposto ("12345", visto in produzione il 16/09/2026) non passa.
    telaio: telaioDaSalvare(testo(dati.vin)),
  };
}
