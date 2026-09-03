/**
 * Chi ha comprato la vettura.
 *
 * Chiesto dal titolare il 03/09/2026: quando una vettura passa a "venduta",
 * deve restare archiviato a chi e' stata venduta.
 *
 * **I dati si congelano sulla vendita, non si leggono dalla rubrica.** Un
 * collegamento dice chi e' quel cliente *oggi*: se fra due anni cambia
 * indirizzo, o viene cancellato, la vendita cambierebbe insieme a lui o
 * resterebbe senza nome. Una vendita e' un fatto avvenuto in un giorno
 * preciso. Il collegamento alla rubrica resta comunque, per ritrovare il
 * cliente: sono due cose diverse e ci sono tutte e due.
 */

export type Compratore = {
  buyer_first_name?: string | null;
  buyer_last_name?: string | null;
  buyer_company?: string | null;
  buyer_vat_number?: string | null;
  buyer_tax_code?: string | null;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  buyer_address?: string | null;
  buyer_zip_code?: string | null;
  buyer_city?: string | null;
  buyer_province?: string | null;
};

export type ClienteInRubrica = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  vat_number?: string | null;
  tax_code?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  province?: string | null;
};

function pulito(valore: string | null | undefined) {
  const testo = String(valore ?? "").trim();
  return testo.length > 0 ? testo : null;
}

/**
 * Il nome con cui si legge il compratore.
 *
 * **La ragione sociale vince sulla persona.** Quando un'auto la compra una
 * societa', la fattura e il passaggio di proprieta' vanno a lei: il nome della
 * persona che ha firmato e' un dettaglio, e metterlo davanti farebbe cercare
 * la vendita sotto il nome sbagliato.
 */
export function nomeCompratore(compratore: Compratore | null | undefined): string | null {
  if (!compratore) return null;

  const societa = pulito(compratore.buyer_company);
  if (societa) return societa;

  const persona = [pulito(compratore.buyer_first_name), pulito(compratore.buyer_last_name)].filter(Boolean).join(" ");
  return persona.length > 0 ? persona : null;
}

/** La riga sotto il nome: chi ha firmato per la societa', e i recapiti. */
export function dettaglioCompratore(compratore: Compratore | null | undefined): string[] {
  if (!compratore) return [];

  const righe: string[] = [];
  const societa = pulito(compratore.buyer_company);
  const persona = [pulito(compratore.buyer_first_name), pulito(compratore.buyer_last_name)].filter(Boolean).join(" ");

  // La persona si mostra sotto solo se il nome in alto e' quello della
  // societa': altrimenti sarebbe scritta due volte.
  if (societa && persona) righe.push(persona);

  const indirizzo = [
    pulito(compratore.buyer_address),
    [pulito(compratore.buyer_zip_code), pulito(compratore.buyer_city)].filter(Boolean).join(" "),
    pulito(compratore.buyer_province),
  ]
    .filter(Boolean)
    .join(", ");

  if (indirizzo) righe.push(indirizzo);

  const recapiti = [pulito(compratore.buyer_phone), pulito(compratore.buyer_email)].filter(Boolean).join(" · ");
  if (recapiti) righe.push(recapiti);

  const fiscali = [
    pulito(compratore.buyer_vat_number) ? `P. IVA ${pulito(compratore.buyer_vat_number)}` : null,
    pulito(compratore.buyer_tax_code) ? `C.F. ${pulito(compratore.buyer_tax_code)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (fiscali) righe.push(fiscali);

  return righe;
}

/**
 * Un compratore senza nessun nome non e' un compratore: sarebbe una riga che
 * dice "venduta a qualcuno", cioe' quello che c'era prima. Lo impone anche il
 * database, ma il rifiuto deve arrivare prima, mentre si compila.
 */
export function compratoreHaUnNome(compratore: Compratore): boolean {
  return nomeCompratore(compratore) !== null;
}

/** Riempie il modulo del compratore da un cliente scelto in rubrica. */
export function compratoreDaCliente(cliente: ClienteInRubrica): Compratore {
  return {
    buyer_first_name: pulito(cliente.first_name),
    buyer_last_name: pulito(cliente.last_name),
    buyer_company: pulito(cliente.company),
    buyer_vat_number: pulito(cliente.vat_number),
    buyer_tax_code: pulito(cliente.tax_code),
    buyer_email: pulito(cliente.email),
    // Il cellulare vale come telefono se il fisso non c'e': su un contratto
    // serve un numero che risponda, non la colonna giusta.
    buyer_phone: pulito(cliente.phone) ?? pulito(cliente.mobile),
    buyer_address: pulito(cliente.address),
    buyer_zip_code: pulito(cliente.zip_code),
    buyer_city: pulito(cliente.city),
    buyer_province: pulito(cliente.province),
  };
}

/** Il cliente da scrivere in rubrica quando il compratore e' nuovo. */
export function clienteDaCompratore(compratore: Compratore) {
  return {
    first_name: pulito(compratore.buyer_first_name),
    last_name: pulito(compratore.buyer_last_name),
    company: pulito(compratore.buyer_company),
    vat_number: pulito(compratore.buyer_vat_number),
    tax_code: pulito(compratore.buyer_tax_code),
    email: pulito(compratore.buyer_email),
    phone: pulito(compratore.buyer_phone),
    address: pulito(compratore.buyer_address),
    zip_code: pulito(compratore.buyer_zip_code),
    city: pulito(compratore.buyer_city),
    province: pulito(compratore.buyer_province),
  };
}

/** Il nome di un cliente in rubrica, per la tendina. */
export function nomeCliente(cliente: ClienteInRubrica): string {
  return (
    nomeCompratore(compratoreDaCliente(cliente)) ?? "Cliente senza nome"
  );
}

/**
 * Vero quando la vettura risulta venduta e non si sa a chi.
 *
 * E' il buco che questa funzione esiste per chiudere: prima del 03/09/2026 una
 * vettura passava a "venduta" senza che nessuno chiedesse niente, e su 275
 * vetture in produzione **zero** avevano un cliente collegato. Dirlo a schermo
 * e' quello che rende la domanda "rimandabile" invece che dimenticabile.
 */
export function venditaSenzaCompratore(status: string | null | undefined, haVendita: boolean): boolean {
  return String(status ?? "").trim().toLowerCase() === "sold" && !haVendita;
}
