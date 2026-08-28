import { formatRegistrationLabel } from "@/lib/vehicles";

/**
 * Il titolo e la descrizione con cui una scheda veicolo si presenta nei
 * risultati di ricerca. Sono cose diverse da quello che si legge sulla
 * pagina, e vivono qui per poterle misurare.
 *
 * Il vincolo che decide tutto: **Google mostra circa sessanta caratteri di
 * titolo** e taglia il resto. Ogni parola in piu' e' una parola sottratta a
 * marca e modello, che sono cio' per cui la gente cerca.
 */

/** Oltre questa soglia Google taglia. Non e' una regola scritta, e' dove taglia. */
export const CARATTERI_VISIBILI_TITOLO = 60;

type VeicoloSeo = {
  color?: string | null;
  mileage?: number | null;
  fuel?: string | null;
  transmission?: string | null;
  price?: string | number | null;
  registration_date?: string | null;
  registration_month?: string | null;
  year?: string | number | null;
};

function pulito(value: unknown): string | null {
  const testo = String(value ?? "").trim();
  return testo.length > 0 ? testo : null;
}

/**
 * Il titolo della scheda, con il colore in coda.
 *
 * Il colore serve a distinguere annunci altrimenti identici, e la misura dice
 * che serve proprio dove c'e' spazio per metterlo. Contato sui 235 veicoli in
 * produzione il 28/08/2026: le schede che condividono il titolo con un'altra
 * sono **le piu' corte** -- mediana 47 caratteri contro 53 delle uniche --
 * perche' sono i km 0 dello stesso modello, quelli con la versione scritta in
 * poche parole. Aggiungendo il colore la loro mediana arriva a 59, sotto la
 * soglia; le uniche sforano, ma quello che Google taglia e' il colore, cioe'
 * l'unica parte di cui non avevano bisogno.
 *
 * Il colore e non i chilometri: aggiungendo entrambi la mediana sale a 72 e
 * 202 titoli su 235 finiscono tagliati. I chilometri stanno nella
 * descrizione, dove c'e' posto.
 */
export function titoloSeoVeicolo(etichetta: string, veicolo: VeicoloSeo): string {
  const colore = pulito(veicolo.color);
  return colore ? `${etichetta} · ${colore}` : etichetta;
}

/**
 * La descrizione che compare sotto il titolo nei risultati.
 *
 * Prima diceva "<titolo> disponibile presso <concessionaria>. Prezzo: X" --
 * ripeteva il titolo e non aggiungeva niente che aiutasse a scegliere fra due
 * risultati. Qui ci vanno i dati che una persona confronta davvero prima di
 * cliccare: chilometri, immatricolazione, alimentazione, cambio, prezzo.
 *
 * Solo quello che c'e'. Un campo assente sparisce, non diventa "non
 * disponibile": una descrizione che elenca cio' che manca e' peggio di una
 * corta.
 */
export function descrizioneSeoVeicolo(
  etichetta: string,
  veicolo: VeicoloSeo,
  concessionaria: string,
  prezzo: string | null
): string {
  // Stessa forma di formatMileage, ma qui un chilometraggio assente deve
  // sparire dalla frase invece di diventare "-": in una descrizione un
  // trattino si legge come un dato, non come un buco. Non si importa quella
  // funzione per non legare un modulo di sola formattazione a
  // public-marketplace, che alla lettura apre il collegamento al database.
  const chilometri =
    typeof veicolo.mileage === "number" && Number.isFinite(veicolo.mileage)
      ? `${new Intl.NumberFormat("it-IT").format(veicolo.mileage)} km`
      : null;

  const immatricolazione = formatRegistrationLabel({
    registration_date: veicolo.registration_date ?? null,
    registration_month: veicolo.registration_month ?? null,
    year: veicolo.year ?? null,
  });

  const dati = [
    chilometri,
    immatricolazione ? `immatricolata ${immatricolazione}` : null,
    pulito(veicolo.fuel),
    pulito(veicolo.transmission),
  ].filter(Boolean);

  const frasi = [
    dati.length > 0 ? `${etichetta}: ${dati.join(", ")}.` : `${etichetta}.`,
    prezzo ? `Prezzo: ${prezzo}.` : null,
    `In vendita presso ${concessionaria} su KeyAuto.`,
  ].filter(Boolean);

  return frasi.join(" ");
}
