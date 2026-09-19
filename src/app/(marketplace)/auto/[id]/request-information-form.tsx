"use client";

import { FormEvent, useState } from "react";
import { trackLead } from "@/lib/measurement-events";

type RequestInformationFormProps = {
  vehicleId: string;
  vehicleLabel: string;
  /** Il nome della concessionaria: la conferma deve dire **a chi** e' arrivata. */
  dealerName: string;
  /** Il suo telefono, se c'e': quando l'invio non riesce, e' l'altra strada. */
  dealerPhone?: string | null;
};

export default function RequestInformationForm({
  vehicleId,
  vehicleLabel,
  dealerName,
  dealerPhone,
}: RequestInformationFormProps) {
  const [customerType, setCustomerType] = useState<"privato" | "azienda" | "">("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    const normalizedMessage = message.trim();

    // Un recapito basta. Vedi la nota nell'endpoint: il modulo pretendeva
    // email **e** telefono mentre la pagina "Come funziona" prometteva "un
    // contatto (email o telefono)". Vinceva il modulo, sul punto del sito che
    // genera i contatti.
    if (!customerType || !normalizedFirstName || !normalizedMessage) {
      setErrorMessage("Servono il nome e il messaggio.");
      return;
    }

    if (!normalizedEmail && !normalizedPhone) {
      setErrorMessage("Lasciaci almeno un recapito: l'email oppure il telefono.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
      vehicleId,
      customer_type: customerType,
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
      email: normalizedEmail || null,
      phone: normalizedPhone || null,
      message: normalizedMessage || null,
    };

    // **Se la rete cade, la richiesta non deve restare appesa.** Senza
    // `try/catch` la promessa veniva rifiutata, `setLoading(false)` non
    // arrivava mai, e il bottone restava disabilitato con scritto "Invio in
    // corso..." **per sempre**: si usciva solo ricaricando e ridigitando
    // tutto. Condizione normale di chi guarda un annuncio in piazzale o passa
    // dal wifi alla rete mobile. Il modulo gemello della registrazione la
    // protezione ce l'aveva gia'; mancava proprio su quello che porta i
    // clienti.
    let response: Response;
    try {
      response = await fetch("/api/marketplace/lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      setLoading(false);
      // I campi **restano compilati**: nessuno deve ridigitare niente. E il
      // messaggio dice cosa fare, non solo che e' andata male.
      setErrorMessage(
        dealerPhone
          ? `Non siamo riusciti a inviare la richiesta: riprova, oppure chiama ${dealerPhone}.`
          : "Non siamo riusciti a inviare la richiesta: controlla la connessione e riprova.",
      );
      return;
    }

    const result = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

    setLoading(false);

    if (!response.ok) {
      console.error("Lead insert error", result);
      setErrorMessage(result?.error || "Errore durante l'invio della richiesta.");
      return;
    }

    // Solo dopo che la richiesta e' davvero arrivata: contare un tentativo
    // fallito come contatto renderebbe i numeri piu' belli e inutili.
    // Del veicolo, non della persona: chi ha scritto non riguarda le
    // statistiche.
    trackLead("veicolo", { veicolo: vehicleLabel, veicolo_id: vehicleId });

    // Il modulo sparisce e lascia il posto alla conferma: non si svuotano
    // piu' i campi, perche' non ci sono piu' campi da svuotare.
    setSuccessMessage(result?.message || null);
  };

  /**
   * **La conferma prende il posto del modulo.**
   *
   * Prima il messaggio verde nasceva **in cima** al riquadro e il bottone
   * stava in fondo: su un telefono sono circa settecento pixel di distanza,
   * piu' di una schermata. I campi si svuotavano e basta, quindi chi non
   * vedeva niente ricompilava e inviava di nuovo -- **e la concessionaria
   * riceveva due contatti che sembrano due persone diverse**. Succedeva al
   * cento per cento degli invii.
   *
   * Adesso al posto del modulo compare una conferma grande, che dice **a chi
   * e' arrivata** e **cosa succede adesso**. E non c'e' piu' nessun bottone
   * da premere: un secondo invio non parte nemmeno per sbaglio.
   */
  if (successMessage !== null) {
    return (
      <div className="min-w-0 max-w-full overflow-hidden rounded-[32px] border border-emerald-400/25 bg-gradient-to-b from-emerald-500/10 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">Richiesta inviata</p>
        <h2 className="mt-3 min-w-0 break-words text-2xl font-bold text-white [overflow-wrap:anywhere]">
          La tua richiesta e&apos; arrivata a {dealerName}
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          Ti risponderanno direttamente, ai recapiti che hai lasciato. Non serve rimandarla.
        </p>
        <p className="mt-2 min-w-0 break-words text-sm leading-7 text-slate-400 [overflow-wrap:anywhere]">
          Riguarda: {vehicleLabel}
        </p>
        {dealerPhone ? (
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Se hai fretta puoi anche chiamarli:{" "}
            <a href={`tel:${dealerPhone.replace(/\s+/g, "")}`} className="font-semibold text-cyan-300 underline underline-offset-4">
              {dealerPhone}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-slate-800/60 to-slate-900 p-6 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.6)]">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Richiedi informazioni</p>
      <h2 className="mt-3 min-w-0 max-w-full break-words text-xl font-bold text-white [overflow-wrap:anywhere]">{vehicleLabel}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-400">Compila il form per essere ricontattato dalla concessionaria.</p>

      {/* L'errore resta in cima, ma con `role="alert"` viene annunciato da
          solo a chi usa un lettore di schermo, che altrimenti non saprebbe
          mai che qualcosa e' andato storto. La conferma non e' piu' qui:
          prende il posto dell'intero modulo, piu' sopra. */}
      {errorMessage ? (
        <div role="alert" className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <div>
          <span className="text-sm font-medium text-slate-300">Tipo cliente *</span>
          <div className="mt-2 flex gap-3">
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-300 transition has-[:checked]:border-blue-400/50 has-[:checked]:bg-blue-500/15 has-[:checked]:text-white">
              <input
                type="radio"
                name="customerType"
                value="privato"
                checked={customerType === "privato"}
                onChange={() => setCustomerType("privato")}
                required
                className="sr-only"
              />
              Privato
            </label>
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-300 transition has-[:checked]:border-blue-400/50 has-[:checked]:bg-blue-500/15 has-[:checked]:text-white">
              <input
                type="radio"
                name="customerType"
                value="azienda"
                checked={customerType === "azienda"}
                onChange={() => setCustomerType("azienda")}
                required
                className="sr-only"
              />
              Azienda
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome *" value={firstName} onChange={setFirstName} required autoComplete="given-name" />
          <Field label="Cognome" value={lastName} onChange={setLastName} autoComplete="family-name" />
        </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="Telefono" type="tel" value={phone} onChange={setPhone} autoComplete="tel" />
        <p className="-mt-1 text-xs text-slate-400">Basta uno dei due: ti ricontattano dove preferisci.</p>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">Messaggio *</span>
          <textarea
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            suppressHydrationWarning
            style={{ color: "#f8fafc" }}
            className="mt-2 w-full rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-blue-400/50 focus:bg-white/[0.06]"
            placeholder="Scrivi la tua richiesta"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-white via-blue-100 to-blue-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_30px_-10px_rgba(76,130,247,0.7)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Invio in corso..." : "Invia richiesta"}
        </button>

        <p className="text-xs leading-5 text-slate-500">
          Inviando la richiesta dichiari di aver letto l&apos;
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">informativa sulla privacy</a>
          {" "}e acconsenti al trattamento dei tuoi dati per essere ricontattato dalla concessionaria.
        </p>
      </form>
    </div>
  );
}

/**
 * **`autoComplete` non e' un dettaglio: e' la differenza fra quattro campi da
 * digitare col pollice e quattro tocchi.** Senza, il telefono non offre il
 * nome e l'indirizzo che ha gia' salvati, e su un modulo compilato in
 * piazzale davanti a un'auto ogni campo in piu' e' un motivo per lasciar
 * perdere. Il modulo gemello della registrazione li dichiarava gia' tutti e
 * cinque dal primo giorno: la competenza c'era, mancava di averla applicata
 * **dove porta i clienti**.
 */
function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        autoComplete={autoComplete}
        suppressHydrationWarning
        style={{ color: "#f8fafc" }}
        className="mt-2 w-full rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-blue-400/50 focus:bg-white/[0.06]"
      />
    </label>
  );
}
