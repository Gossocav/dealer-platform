/**
 * Il controllo a mano della sincronizzazione dello stock.
 *
 * Chiesto dal titolare il 10/09/2026. Non e' tracciato da git: se sparisce si
 * riscrive da questa descrizione.
 *
 *   set -a; . ./.env.production; set +a; node .controllo-sincronizzazione.mjs
 *
 * Il semaforo verde di GitHub non basta: non esiste nessun registro delle
 * importazioni, e l'unico dato vero e' `import_synced_at` sui singoli annunci.
 *
 * Guarda due cose, e la seconda e' quella che conta:
 *
 * 1. **da quanto risale la scheda piu' recente.** E' il colpo d'occhio.
 * 2. **quante schede sono state ricontrollate nelle ultime 24 ore.** E' la
 *    misura vera. Dal 07/09/2026 il sito di Autogepy lasciava passare la prima
 *    lettura e rifiutava tutte le altre: guardando solo la piu' recente, un
 *    sito fermo da tre giorni sembrava sincronizzato un minuto fa. E' lo
 *    stesso metro che usa adesso l'avviso automatico (PR #317).
 *
 * Esce con 1 se un sito e' fermo, cosi' si puo' incatenare a qualcos'altro.
 */
import { createClient } from "@supabase/supabase-js";

/** Sotto questa soglia di ore la scheda piu' recente e' comunque troppo vecchia. */
const ORE_DI_ALLARME = 8;

/** Meno di un terzo dello stock ricontrollato in 24 ore: il sito non gira. */
const QUOTA_MINIMA = 3;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chiave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chiave) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Si esportano cosi':  set -a; . ./.env.production; set +a");
  process.exit(2);
}

const supabase = createClient(url, chiave, { auth: { persistSession: false } });

// Il database consegna mille righe per volta e non lo dice.
const righe = [];
for (let da = 0; ; da += 1000) {
  const { data, error } = await supabase
    .from("vehicles")
    .select("import_source, import_synced_at, import_missing_since, status, published")
    .not("import_source", "is", null)
    .range(da, da + 999);

  if (error) {
    console.error("Lettura fallita:", error.message);
    process.exit(2);
  }

  righe.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}

const adesso = Date.now();
const perSito = new Map();

for (const r of righe) {
  const sito = String(r.import_source ?? "").trim();
  if (!sito) continue;

  const s = perSito.get(sito) ?? { annunci: 0, inVetrina: 0, spariti: 0, ultima: null, fresche: 0, daTenereFresche: 0 };
  s.annunci += 1;
  if (r.published === true && String(r.status ?? "").toLowerCase() === "published") s.inVetrina += 1;

  if (r.import_missing_since) {
    // Non e' piu' sul sito: non va tenuta fresca, e non deve far scattare niente.
    s.spariti += 1;
  } else {
    s.daTenereFresche += 1;
    const t = r.import_synced_at ? Date.parse(r.import_synced_at) : Number.NaN;
    if (!Number.isNaN(t) && adesso - t < 24 * 3600 * 1000) s.fresche += 1;
  }

  const t = r.import_synced_at ? Date.parse(r.import_synced_at) : Number.NaN;
  if (!Number.isNaN(t) && (s.ultima === null || t > s.ultima)) s.ultima = t;

  perSito.set(sito, s);
}

console.log(`Controllo del ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n`);

let allarme = false;

for (const [sito, s] of [...perSito.entries()].sort()) {
  const ore = s.ultima === null ? null : (adesso - s.ultima) / 3_600_000;
  const nonGira = s.daTenereFresche > 0 && s.fresche * QUOTA_MINIMA < s.daTenereFresche;
  const vecchia = ore === null || ore > ORE_DI_ALLARME;
  const fermo = nonGira || vecchia;
  if (fermo) allarme = true;

  console.log(`${fermo ? "!!" : "ok"}  ${sito}`);
  console.log(`      scheda piu' recente: ${ore === null ? "mai sincronizzato" : `${ore.toFixed(1)} ore fa`}`);
  console.log(`      ricontrollate in 24 ore: ${s.fresche} su ${s.daTenereFresche}${nonGira ? "   <-- il sito non gira" : ""}`);
  console.log(`      annunci ${s.annunci}, in vetrina ${s.inVetrina}, spariti dal sito ${s.spariti}\n`);
}

if (perSito.size === 0) {
  console.log("Nessun sito collegato: non c'e' niente da sincronizzare.");
  process.exit(0);
}

if (allarme) {
  console.log("Almeno un sito e' fermo. Guarda l'ultimo giro su GitHub -> Actions -> Sincronizzazione stock dai siti.");
  process.exit(1);
}

console.log("Tutti i siti girano.");
