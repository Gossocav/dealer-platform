import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modulo = readFileSync(
  resolve(process.cwd(), "src/app/(marketplace)/auto/[id]/request-information-form.tsx"),
  "utf8",
);
const scheda = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/auto/[id]/page.tsx"), "utf8");
const elenco = readFileSync(resolve(process.cwd(), "src/app/(marketplace)/concessionarie/page.tsx"), "utf8");
const vista = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260919010000_i_numeri_della_vetrina_si_contano_nel_database.sql"),
  "utf8",
);
const nastro = readFileSync(resolve(process.cwd(), "src/components/marketplace/marquee-dealers.tsx"), "utf8");

/**
 * **Il modulo che porta i clienti era la parte meno curata del sito.**
 *
 * Trovato guardando le pagine pubbliche da un telefono, il 19/09/2026. Due
 * difetti, tutti e due al cento per cento degli invii, tutti e due i modi
 * piu' stupidi di perdere un contatto:
 *
 * 1. chi inviava **non vedeva nessuna conferma** (il messaggio nasceva in
 *    cima al riquadro, il bottone stava in fondo, settecento pixel piu' giu')
 *    e rimandava: la concessionaria riceveva due contatti che sembrano due
 *    persone diverse;
 * 2. chi aveva la rete debole **restava bloccato per sempre** su "Invio in
 *    corso...", e usciva solo ricaricando e ridigitando tutto.
 *
 * La resa a video non e' verificabile da qui: questi test fissano le
 * decisioni, e ognuno nomina il difetto che impedisce.
 */
describe("dopo l'invio il modulo lascia il posto alla conferma", () => {
  it("la conferma sostituisce il modulo invece di comparirgli sopra", () => {
    // Un messaggio in cima e il bottone in fondo, su un telefono, sono due
    // schermate diverse: chi preme non vede che e' andata bene.
    expect(modulo).toContain("if (successMessage !== null) {");
    expect(modulo, "la conferma e' tornata un riquadro dentro il modulo").not.toContain(
      "border-emerald-400/20 bg-emerald-400/10 px-4 py-3",
    );
  });

  it("dice a chi e' arrivata e cosa succede adesso", () => {
    expect(modulo).toContain("La tua richiesta e&apos; arrivata a {dealerName}");
    expect(modulo).toContain("Ti risponderanno direttamente");
    // E la scheda glielo passa davvero: senza, direbbe "arrivata a".
    expect(scheda).toContain("dealerName={dealerDisplayName}");
  });

  it("dopo un invio riuscito non c'e' piu' niente da premere", () => {
    // Il bottone non resta disabilitato: sparisce con tutto il modulo,
    // quindi un secondo invio non parte nemmeno per sbaglio.
    const conferma = modulo.slice(modulo.indexOf("if (successMessage !== null) {"), modulo.indexOf("return (\n    <div className=\"min-w-0 max-w-full overflow-hidden rounded-[32px] border border-white/10"));
    expect(conferma).not.toContain("<form");
    expect(conferma).not.toContain('type="submit"');
  });
});

describe("se la rete cade nessuno deve ridigitare niente", () => {
  it("l'invio e' protetto, e il bottone torna cliccabile", () => {
    // Senza try/catch la promessa veniva rifiutata e `setLoading(false)` non
    // arrivava mai: il bottone restava disabilitato per sempre.
    const invio = modulo.slice(modulo.indexOf("let response: Response;"), modulo.indexOf("const result ="));
    expect(invio).toContain("try {");
    expect(invio).toContain("} catch {");
    expect(invio).toContain("setLoading(false);");
  });

  it("i campi restano compilati e il messaggio dice cosa fare", () => {
    const ramoErrore = modulo.slice(modulo.indexOf("} catch {"), modulo.indexOf("const result ="));
    // Nessuno svuotamento dei campi nel ramo dell'errore.
    for (const campo of ["setFirstName(\"\")", "setEmail(\"\")", "setMessage(\"\")"]) {
      expect(ramoErrore, `il ramo dell'errore svuota ${campo}`).not.toContain(campo);
    }
    expect(ramoErrore).toContain("Non siamo riusciti a inviare la richiesta");
    expect(ramoErrore).toContain("oppure chiama");
    // Il numero da chiamare arriva dalla scheda.
    expect(scheda).toContain("dealerPhone={dealerPhone}");
  });

  it("e l'errore viene annunciato a chi non lo vede", () => {
    expect(modulo).toContain('role="alert"');
  });
});

describe("i numeri della vetrina si contano nel database", () => {
  it("l'elenco non li ricava piu' dalle automobili scaricate", () => {
    // Il difetto: 240 automobili scaricate su 279 pubblicate, e da quelle si
    // contavano veicoli e prezzi. AUTOGEPY mostrava 114 invece di 135, il
    // prezzo minimo di De Lorenzi 7.500 euro invece di 5.800.
    expect(elenco, "i prezzi si calcolano ancora sull'elenco scaricato").not.toContain("prices.reduce(");
    expect(elenco, "il conteggio viene ancora dalla lunghezza dell'elenco").not.toContain(
      "{group.vehicles.length} veicoli pubblicati",
    );
    expect(elenco).toContain("vetrina_per_concessionaria");
  });

  it("e il tetto che resta serve solo alle fotografie", () => {
    expect(elenco).toContain("COPERTINE_DA_SCARICARE");
    expect(elenco, "il tetto e' stato alzato invece di cambiare strada").not.toContain("= 1000");
  });

  it("finche' la vista non c'e', nessun numero invece di uno sbagliato", () => {
    // Le modifiche al database le applica a mano il titolare: fra il codice
    // in linea e la vista creata c'e' sempre una finestra.
    expect(elenco).toContain("tabellaNonAncoraCreata(error.message");
    expect(elenco).toContain("{numeri ?");
  });

  it("la vista rispetta le regole per riga di chi interroga", () => {
    // Senza `security_invoker` una vista gira con i permessi di chi la
    // possiede: e' il modo classico di scavalcare l'isolamento fra
    // concessionarie senza accorgersene.
    expect(vista).toContain("security_invoker = on");
    expect(vista).toContain("revoke all on public.vetrina_per_concessionaria from public");
    expect(vista).toContain("grant select on public.vetrina_per_concessionaria to anon, authenticated");
  });

  it("e usa gli stessi filtri del marketplace", () => {
    // Un filtro che si allontana farebbe dire alla pagina un numero che non
    // corrisponde alle automobili che poi mostra.
    expect(vista).toContain("v.published = true");
    expect(vista).toContain("v.status = 'published'");
    expect(vista).toContain("d.status in ('approved', 'active')");
    // Un'automobile senza prezzo non abbassa la media a zero.
    expect(vista).toContain("filter (where v.price > 0)");
  });
});

describe("il nastro delle concessionarie non viene piu' tagliato", () => {
  it("quando sta fermo, i nomi vanno a capo", () => {
    // Il `flex-wrap` stava sul contenitore che ha un figlio solo, quindi non
    // mandava a capo niente: i tre nomi su una riga da 583px dentro uno
    // schermo da 360, tagliati su tutti e due i lati. Si leggeva per intero
    // solo "DE LORENZI SRL".
    const ramoFermo = nastro.slice(nastro.indexOf("{!scorre ? ("), nastro.indexOf(") : ("));
    expect(ramoFermo).toContain("aCapo");
    expect(nastro).toContain("flex flex-wrap items-center justify-center gap-x-8");
  });

  it("quando scorre, invece, non deve andare a capo", () => {
    // Solo il ramo, non tutto cio' che segue: piu' in basso c'e' la
    // definizione di MarqueeRow, che la parola la contiene per forza.
    const inizio = nastro.indexOf(") : (");
    const ramoScorrevole = nastro.slice(inizio, nastro.indexOf("function MarqueeRow", inizio));
    expect(ramoScorrevole).toContain("marketplace-marquee-track");
    expect(ramoScorrevole, "la striscia che scorre andrebbe a capo e si romperebbe").not.toContain("aCapo");
  });
});
