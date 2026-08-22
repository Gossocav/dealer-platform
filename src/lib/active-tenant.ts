import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";

const ACTIVE_DEALER_STORAGE_KEY = "dp.activeDealerId";

function normalizeDealerId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const lowered = text.toLowerCase();
  if (lowered === "null" || lowered === "undefined") {
    return null;
  }

  return text;
}

function canUseWindow() {
  return typeof window !== "undefined";
}

export function getActiveDealerId() {
  if (!canUseWindow()) {
    return null;
  }

  return normalizeDealerId(window.localStorage.getItem(ACTIVE_DEALER_STORAGE_KEY));
}

export function setActiveDealerId(value: string | null) {
  if (!canUseWindow()) {
    return;
  }

  const normalized = normalizeDealerId(value);
  if (!normalized) {
    window.localStorage.removeItem(ACTIVE_DEALER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ACTIVE_DEALER_STORAGE_KEY, normalized);
}

export function buildActiveDealerHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
  const activeDealerId = getActiveDealerId();

  if (activeDealerId) {
    headers.set("x-active-dealer-id", activeDealerId);
  }

  return headers;
}

/**
 * La concessionaria dell'utente collegato, per le pagine del gestionale.
 *
 * Mette insieme i tre passaggi che servivano ogni volta -- chi e' l'utente,
 * a quale concessionaria appartiene, quale ha scelto se ne ha piu' d'una --
 * perche' ripeterli in ogni pagina significa prima o poi dimenticarne uno. E
 * quello dimenticato di solito e' il terzo.
 *
 * Restituisce null se la sessione non e' valida o se l'utente non risulta
 * associato a nessuna concessionaria: in quel caso la pagina non deve
 * interrogare niente, non deve mostrare un elenco vuoto come se fosse un
 * risultato.
 */
export async function resolveDealerIdForCurrentUser(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  const userId = data?.user?.id;

  if (error || !userId) {
    return null;
  }

  const dealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
    activeDealerId: getActiveDealerId(),
  });

  // La memoria del browser si allinea a quello che vale davvero: cosi' un
  // valore rimasto da un altro accesso non sopravvive alla prima pagina
  // aperta.
  if (dealerId !== getActiveDealerId()) {
    setActiveDealerId(dealerId);
  }

  return dealerId;
}
