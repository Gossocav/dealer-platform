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

/** Tabelle che un visitatore non deve poter leggere, per nessun motivo. */
const RISERVATE = [
  "leads", "customers", "appointments", "notifications", "lead_activities",
  "email_messages", "email_threads", "email_attachments", "email_delivery_events",
  "email_queue", "dealer_email_templates", "profiles", "dealer_users",
  "import_runs", "import_items", "import_errors", "import_sources",
  "import_profiles", "import_dedup_keys", "audit_logs", "dealer_demo_subscriptions",
  "demo_requests", "dealer_info_requests",
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

console.log("");

if (aperte > 0) {
  console.log(`Esito: ${aperte} tabelle esposte. La migration non e' applicata, o non copre tutto.\n`);
  process.exit(1);
}

console.log("Esito: nessun dato di concessionaria leggibile senza login.\n");
