import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Segna quando un account ha cambiato la password.
 *
 * Serve alla scadenza dei tre mesi: senza una data da qualche parte, non c'e'
 * modo di sapere quando quella password e' stata scelta -- Supabase conserva
 * l'impronta, non la storia.
 *
 * **La data si scrive in `app_metadata`, non in una tabella nostra.** Due
 * motivi. Il primo: `app_metadata` lo puo' scrivere solo il server con la
 * chiave di servizio, mentre tutto il resto del profilo il concessionario lo
 * puo' modificare da se' -- e una scadenza che il diretto interessato puo'
 * spostare in avanti non e' una scadenza. Il secondo: non richiede nessuna
 * modifica al database, che in questo progetto le applica a mano il titolare.
 *
 * Non ci si fida di chi chiama nemmeno per il momento in cui timbrare: la data
 * la mette il server, e solo in due casi. O l'account non ne ha ancora una --
 * sono quelli che esistevano prima di questa regola, e i tre mesi partono dal
 * primo ingresso -- oppure la password e' stata cambiata proprio adesso.
 * Chiamare questo indirizzo a caso, per rimandare la scadenza, non fa niente.
 */

/** Quanto indietro puo' essere il cambio password perche' si consideri "adesso". */
const FINESTRA_CAMBIO_MS = 5 * 60 * 1000;

function estraiToken(intestazione: string | null) {
  const grezzo = String(intestazione ?? "").trim();
  if (!grezzo.toLowerCase().startsWith("bearer ")) return null;

  const token = grezzo.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const token = estraiToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const {
    data: { user },
    error: erroreUtente,
  } = await admin.auth.getUser(token);

  if (erroreUtente || !user) {
    return NextResponse.json({ error: "Utente non autenticato." }, { status: 401 });
  }

  const metadati = (user.app_metadata ?? {}) as Record<string, unknown>;
  const dataEsistente = typeof metadati.password_changed_at === "string" ? metadati.password_changed_at : null;

  const aggiornatoIl = user.updated_at ? new Date(user.updated_at).getTime() : null;
  const cambiataAdesso = aggiornatoIl !== null && Date.now() - aggiornatoIl <= FINESTRA_CAMBIO_MS;

  if (dataEsistente && !cambiataAdesso) {
    return NextResponse.json({ passwordChangedAt: dataEsistente, aggiornata: false }, { status: 200 });
  }

  const adesso = new Date().toISOString();

  const scrittura = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...metadati, password_changed_at: adesso },
  });

  if (scrittura.error) {
    console.error("password-aggiornata:update", scrittura.error);
    return NextResponse.json({ error: "Non e stato possibile registrare il cambio password." }, { status: 500 });
  }

  return NextResponse.json({ passwordChangedAt: adesso, aggiornata: true }, { status: 200 });
}
