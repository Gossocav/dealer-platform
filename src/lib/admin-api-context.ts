/**
 * Chi sta chiamando e' un amministratore della piattaforma?
 *
 * La stessa verifica era scritta a mano dentro sei endpoint del pannello, uno
 * per uno. Finche' restano uguali non fa danni, ma e' un **controllo di
 * accesso**: il giorno che una delle sei copie si scosta dalle altre, la
 * schermata che se ne dimentica e' quella che lascia entrare qualcuno.
 *
 * Questo modulo e' la settima strada, e non ne aggiunge una copia: e' pensato
 * perche' le altre sei ci si spostino sopra. Sono rimaste com'erano di
 * proposito -- spostarle e' una modifica che tocca sei endpoint di
 * amministrazione e va fatta da sola, non nascosta dentro una funzione nuova.
 *
 * Il controllo e' in due tempi, come nell'originale: prima il ruolo scritto
 * nell'account, poi -- solo se il primo non basta -- quello sul profilo.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformAdminRole, resolveUserRoleFromMetadata } from "@/lib/account-approval";
import { cambiaQualcosa, registraAccessoAmministrativo } from "@/lib/storico-accessi-admin";

type ProfileRoleRow = { role: string | null };

export type ContestoAmministratore =
  | { errore: NextResponse; supabaseAdmin: null; chiamanteId: null }
  | { errore: null; supabaseAdmin: SupabaseClient; chiamanteId: string };

function leggiToken(intestazione: string | null): string | null {
  const testo = String(intestazione ?? "").trim();
  if (!testo.toLowerCase().startsWith("bearer ")) return null;

  const token = testo.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function contestoAmministratore(request: Request): Promise<ContestoAmministratore> {
  const indirizzo = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chiaveDiServizio = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!indirizzo || !chiaveDiServizio) {
    return {
      errore: NextResponse.json({ error: "Configurazione server incompleta." }, { status: 500 }),
      supabaseAdmin: null,
      chiamanteId: null,
    };
  }

  const token = leggiToken(request.headers.get("authorization"));

  if (!token) {
    return {
      errore: NextResponse.json({ error: "Sessione non valida." }, { status: 401 }),
      supabaseAdmin: null,
      chiamanteId: null,
    };
  }

  const supabaseAdmin = createClient(indirizzo, chiaveDiServizio, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const {
    data: { user },
    error: erroreUtente,
  } = await supabaseAdmin.auth.getUser(token);

  if (erroreUtente || !user) {
    return {
      errore: NextResponse.json({ error: "Utente non autenticato." }, { status: 401 }),
      supabaseAdmin: null,
      chiamanteId: null,
    };
  }

  let autorizzato = isPlatformAdminRole(resolveUserRoleFromMetadata(user));

  if (!autorizzato) {
    const profilo = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle<ProfileRoleRow>();

    if (profilo.error) {
      return {
        errore: NextResponse.json(
          { error: profilo.error.message || "Errore verifica autorizzazioni." },
          { status: 500 }
        ),
        supabaseAdmin: null,
        chiamanteId: null,
      };
    }

    autorizzato = isPlatformAdminRole(profilo.data?.role);
  }

  const percorso = new URL(request.url).pathname;

  if (!autorizzato) {
    // Qualcuno con una sessione valida, che amministratore non e', ha
    // bussato. E' il segnale che vale la pena avere: prima non ne restava
    // traccia da nessuna parte. Non si aspetta l'esito -- lo storico non
    // deve poter cambiare cosa risponde la serratura.
    void registraAccessoAmministrativo(supabaseAdmin, {
      azione: "admin.accesso_negato",
      chiamanteId: user.id,
      percorso,
      metodo: request.method,
      motivo: "ruolo non amministrativo",
    });

    return {
      errore: NextResponse.json({ error: "Accesso negato." }, { status: 403 }),
      supabaseAdmin: null,
      chiamanteId: null,
    };
  }

  // Le sole letture non si registrano: il pannello ne fa parecchie a ogni
  // schermata, e lo storico diventerebbe illeggibile.
  if (cambiaQualcosa(request.method)) {
    void registraAccessoAmministrativo(supabaseAdmin, {
      azione: "admin.azione",
      chiamanteId: user.id,
      percorso,
      metodo: request.method,
    });
  }

  return { errore: null, supabaseAdmin, chiamanteId: user.id };
}
