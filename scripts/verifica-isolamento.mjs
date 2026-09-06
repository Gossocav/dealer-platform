#!/usr/bin/env node
/**
 * Verifica che i dati delle concessionarie non siano leggibili senza login.
 *
 * Interroga il database con la sola chiave pubblica del sito -- la stessa che
 * chiunque puo' leggere aprendo gli strumenti del browser -- e riporta cosa
 * ottiene. Serve a controllare la produzione prima e dopo aver applicato la
 * migration 20260822000000_isolamento_tenant_rls.sql.
 *
 * Uso:
 *   set -a; . ./.env.production; set +a
 *   node scripts/verifica-isolamento.mjs
 *
 * Esce con codice 1 se una tabella con dati di concessionaria e' leggibile.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chiave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !chiave) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(2);
}

/**
 * Tabelle che un visitatore non deve poter leggere, per nessun motivo.
 *
 * src/lib/verifica-isolamento-copertura.test.ts controlla che copra **tutte** le tabelle create dalle migration: fino al
 * 06/09/2026 ne guardava 23 su 33, e le dieci scoperte comprendevano perizie,
 * documenti, conto economico e vendite. Nessuno le aveva mai provate.
 */
const RISERVATE = [
  "leads", "customers", "appointments", "notifications", "lead_activities",
  "email_messages", "email_threads", "email_attachments", "email_delivery_events",
  "email_queue", "dealer_email_templates", "profiles", "dealer_users",
  "import_runs", "import_items", "import_errors", "import_sources",
  "import_profiles", "import_dedup_keys", "audit_logs", "dealer_demo_subscriptions",
  "demo_requests", "dealer_info_requests",
  // Aggiunte il 06/09/2026: c'erano da mesi, il controllo non le guardava.
  // Le prime quattro sono le piu' delicate del gestionale.
  "vehicle_appraisals", "vehicle_documents", "vehicle_economics", "vehicle_sales",
  "promemoria", "marketplace_views", "platform_email_templates",
  // Il freno alle richieste (06/09/2026): contiene gli indirizzi di rete di
  // chi ha compilato i moduli, e chi la sapesse svuotare disattiverebbe il
  // freno per tutti.
  "rate_limits",
];

/**
 * Tabelle che il marketplace deve poter mostrare, ma solo in parte: i veicoli
 * pubblicati e le concessionarie attive. Qui non basta contare le righe, si
 * controlla che non passi quello che deve restare privato.
 */
const VETRINA = {
  vehicles: { filtro: "published=eq.false", descrizione: "veicoli non pubblicati" },
  dealers: { filtro: "status=neq.approved&status=neq.active", descrizione: "concessionarie non attive" },
};

/**
 * `vehicle_images` e' l'unica tabella che si apre davvero alla chiave
 * pubblica: la vetrina deve mostrare le fotografie. Contare le righe non dice
 * niente -- devono esserci. La domanda giusta e' un'altra: **di quali veicoli
 * sono?**
 *
 * Una fotografia di un veicolo non pubblicato e' un veicolo su cui la
 * concessionaria sta ancora lavorando, prezzo compreso. Il controllo si fa
 * tutto dal lato di un estraneo, senza chiavi speciali: si prendono i veicoli
 * che l'estraneo vede, si prendono le fotografie che l'estraneo vede, e ogni
 * fotografia deve appartenere a un veicolo di quell'elenco.
 */
const IMMAGINI = "vehicle_images";

async function leggi(percorso) {
  const risposta = await fetch(`${url}/rest/v1/${percorso}`, {
    headers: { apikey: chiave, Authorization: `Bearer ${chiave}` },
    signal: AbortSignal.timeout(20000),
  });
  const corpo = await risposta.json().catch(() => null);
  return Array.isArray(corpo) ? corpo : null;
}

let aperte = 0;

console.log("\nCosa vede un visitatore senza login\n");

for (const tabella of RISERVATE) {
  const righe = await leggi(`${tabella}?select=*&limit=5`);
  if (righe === null) {
    console.log(`  ${tabella.padEnd(28)} protetta`);
    continue;
  }
  if (righe.length === 0) {
    console.log(`  ${tabella.padEnd(28)} nessuna riga (vuota o protetta)`);
    continue;
  }
  aperte += 1;
  console.log(`  ${tabella.padEnd(28)} APERTA — ${righe.length}+ righe leggibili`);
}

console.log("\nVetrina pubblica: quello che deve restare fuori\n");

for (const [tabella, { filtro, descrizione }] of Object.entries(VETRINA)) {
  const righe = await leggi(`${tabella}?${filtro}&select=id&limit=5`);
  if (righe === null || righe.length === 0) {
    console.log(`  ${tabella.padEnd(28)} ok — nessun ${descrizione}`);
    continue;
  }
  aperte += 1;
  console.log(`  ${tabella.padEnd(28)} APERTA — ${righe.length}+ ${descrizione}`);
}

console.log("\nFotografie: di quali veicoli sono quelle che si vedono\n");

{
  // Tutto con la sola chiave pubblica: e' quello che vede un estraneo.
  const veicoli = (await leggi("vehicles?select=id&limit=2000")) ?? [];
  const foto = (await leggi(`${IMMAGINI}?select=id,vehicle_id&limit=2000`)) ?? [];
  const visibili = new Set(veicoli.map((v) => v.id));
  const orfane = foto.filter((f) => !visibili.has(f.vehicle_id));

  // Il database consegna mille righe per richiesta e non lo dice. Se
  // l'elenco dei veicoli e' troncato, le fotografie oltre il taglio
  // sembrerebbero orfane senza esserlo: sarebbe un allarme falso, e un
  // allarme falso ripetuto e' il modo in cui si smette di guardare gli
  // allarmi. Meglio dire che non si sa.
  if (veicoli.length >= 1000 || foto.length >= 1000) {
    console.log(`  ${IMMAGINI.padEnd(28)} PARZIALE — il database ne consegna 1000 per volta:`);
    console.log(`  ${"".padEnd(28)} veicoli letti ${veicoli.length}, fotografie lette ${foto.length}.`);
    console.log(`  ${"".padEnd(28)} il confronto qui sotto vale solo su queste.`);
  }

  if (foto.length === 0) {
    console.log(`  ${IMMAGINI.padEnd(28)} nessuna fotografia leggibile`);
  } else if (orfane.length === 0) {
    console.log(`  ${IMMAGINI.padEnd(28)} ok — tutte e ${foto.length} appartengono a veicoli in vetrina`);
  } else {
    aperte += 1;
    console.log(`  ${IMMAGINI.padEnd(28)} APERTA — ${orfane.length} fotografie di veicoli che l'estraneo non dovrebbe vedere`);
    console.log(`  ${"".padEnd(28)} esempio: veicolo ${orfane[0].vehicle_id}`);
  }
}

console.log("");

if (aperte > 0) {
  console.log(`Esito: ${aperte} tabelle esposte. La migration non e' applicata, o non copre tutto.\n`);
  process.exit(1);
}

console.log("Esito: nessun dato di concessionaria leggibile senza login.\n");
