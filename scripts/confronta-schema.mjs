#!/usr/bin/env node
/**
 * Confronta lo schema vero della produzione con quello che i file producono.
 *
 * **Perche' non basta il confronto delle migration.** `supabase migration
 * list` legge il *quaderno* delle migration applicate, e in questo progetto
 * quel quaderno e' fermo a luglio: le migration si applicano a mano
 * dall'editor SQL, e nessuno lo aggiorna. Diceva "ne mancano 77" da sempre.
 * Un allarme che suona sempre e' un allarme che si smette di leggere.
 *
 * Qui si confrontano le due cose che contano davvero: com'e' fatto il
 * database vero, e com'e' fatto quello che nasce dai file. Le stesse otto
 * famiglie -- tabelle, colonne, politiche, permessi, vincoli, funzioni,
 * trigger, indici -- lette dai due lati con **la stessa identica
 * interrogazione**, `public.inventario_schema()`, che nasce da una migration
 * e quindi esiste identica su entrambi.
 *
 * **Legge e basta.** Nessuna scrittura, da nessuna parte.
 *
 * Uso:
 *   node scripts/confronta-schema.mjs --locale <file-inventario.json>
 *
 * L'inventario locale si produce dal database ricostruito dai file:
 *   psql -tAc "select public.inventario_schema()" > inventario-locale.json
 *
 * Con `--produzione <file>` si confrontano due inventari gia' letti, senza
 * toccare la rete: serve a confrontare due ambienti fra loro, e a provare
 * questo strumento senza dipendere dalla produzione.
 */

import { readFileSync } from "node:fs";

const FAMIGLIE = [
  ["tabelle", "tabelle"],
  ["colonne", "colonne"],
  ["politiche", "regole di accesso"],
  ["permessi", "permessi"],
  ["vincoli", "vincoli"],
  ["funzioni", "funzioni"],
  ["trigger", "trigger"],
  ["permessi_funzioni", "chi puo' eseguire le funzioni"],
  ["politiche_storage", "regole dei magazzini dei file"],
  ["indici", "indici"],
];

function argomento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function inventarioDellaProduzione() {
  // L'indirizzo si ricava dall'identificativo del progetto, che e' gia' fra i
  // segreti: cosi' l'unico segreto nuovo da aggiungere e' la chiave.
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (process.env.SUPABASE_PROJECT_ID ? `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co` : null);
  // Una chiave segreta dedicata (`sb_secret_...`), creata apposta per questo
  // controllo: si revoca da sola, senza fermare il sito. La chiave del sito
  // resta il ripiego per chi esegue il controllo dal proprio computer.
  const chiave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Manca SUPABASE_PROJECT_ID (o NEXT_PUBLIC_SUPABASE_URL): non so quale progetto guardare.");
  }
  if (!chiave) {
    throw new Error(
      "Manca SUPABASE_SECRET_KEY: e' la chiave dedicata a questo controllo. Si crea in Supabase, Project Settings -> API Keys -> Secret keys."
    );
  }

  const risposta = await fetch(`${url}/rest/v1/rpc/inventario_schema`, {
    method: "POST",
    headers: {
      apikey: chiave,
      authorization: `Bearer ${chiave}`,
      "content-type": "application/json",
    },
    body: "{}",
  });

  if (!risposta.ok) {
    const testo = await risposta.text();
    if (/inventario_schema/.test(testo) && /not find|does not exist/i.test(testo)) {
      throw new Error(
        "La produzione non ha ancora la funzione inventario_schema(): va applicata la migration 20260910160000."
      );
    }
    if (/permission denied/i.test(testo)) {
      throw new Error(
        "La chiave usata non ha il permesso di eseguire inventario_schema(). Serve una chiave segreta, non quella pubblicabile."
      );
    }
    throw new Error(`La produzione ha risposto ${risposta.status}: ${testo.slice(0, 200)}`);
  }

  return risposta.json();
}

/** Le differenze fra due elenchi gia' ordinati, in entrambi i versi. */
function differenze(daiFile, dallaProduzione) {
  const file = new Set(daiFile ?? []);
  const prod = new Set(dallaProduzione ?? []);

  return {
    soloInProduzione: [...prod].filter((r) => !file.has(r)).sort(),
    soloNeiFile: [...file].filter((r) => !prod.has(r)).sort(),
  };
}

const percorsoLocale = argomento("--locale");
if (!percorsoLocale) {
  console.error("Manca --locale <file>: l'inventario del database ricostruito dai file.");
  process.exit(2);
}

const daiFile = JSON.parse(readFileSync(percorsoLocale, "utf8"));

const percorsoProduzione = argomento("--produzione");

let dallaProduzione;
try {
  dallaProduzione = percorsoProduzione
    ? JSON.parse(readFileSync(percorsoProduzione, "utf8"))
    : await inventarioDellaProduzione();
} catch (errore) {
  // Un guasto di configurazione non e' una differenza fra database: esce con
  // un codice diverso, cosi' chi legge il controllo non confonde "non sono
  // riuscito a guardare" con "ho guardato e non torna".
  console.error("Il controllo non e' stato eseguito.");
  console.error("");
  console.error(errore instanceof Error ? errore.message : String(errore));
  process.exit(2);
}

let differenzeTrovate = 0;
const righe = [];

for (const [chiave, etichetta] of FAMIGLIE) {
  const { soloInProduzione, soloNeiFile } = differenze(daiFile[chiave], dallaProduzione[chiave]);
  if (soloInProduzione.length === 0 && soloNeiFile.length === 0) continue;

  differenzeTrovate += soloInProduzione.length + soloNeiFile.length;
  righe.push(`\n### ${etichetta}`);

  for (const r of soloInProduzione) righe.push(`  IN PRODUZIONE MA NON NEI FILE:  ${r}`);
  for (const r of soloNeiFile) righe.push(`  NEI FILE MA NON IN PRODUZIONE:  ${r}`);
}

if (differenzeTrovate === 0) {
  console.log("Il database di produzione e i file dicono la stessa cosa.");
  for (const [chiave, etichetta] of FAMIGLIE) {
    console.log(`  ${etichetta}: ${(daiFile[chiave] ?? []).length} voci, tutte uguali`);
  }
  process.exit(0);
}

console.log(`Trovate ${differenzeTrovate} differenze fra il database di produzione e i file del progetto.`);
console.log(righe.join("\n"));
console.log(
  "\nCosa vuol dire: qualcuno ha cambiato il database a mano senza mettere la modifica nei file,",
  "\noppure una migration nei file non e' mai stata applicata. In un ripristino da zero,",
  "\nquello che compare come 'IN PRODUZIONE MA NON NEI FILE' non tornerebbe."
);
process.exit(1);
