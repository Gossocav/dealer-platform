"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type FormState = {
  companyName: string;
  vatNumber: string;
  contactName: string;
  email: string;
  phone: string;
  whatsappPhone: string;
  password: string;
  confirmPassword: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

function translateSupabaseAuthError(rawMessage: string | null | undefined) {
  const message = String(rawMessage ?? "").trim();
  const normalized = message.toLowerCase();

  if (!normalized) {
    return "Si e verificato un errore di autenticazione. Riprova tra qualche istante.";
  }

  if (normalized.includes("user already registered")) {
    return "Esiste gia un account registrato con questo indirizzo email. Effettua il login oppure utilizza un'altra email.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Credenziali non valide. Controlla email e password e riprova.";
  }

  if (normalized.includes("password should be at least")) {
    return "La password e troppo corta. Usa almeno 8 caratteri.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Email non ancora confermata. Controlla la tua casella di posta.";
  }

  if (normalized.includes("signup is disabled")) {
    return "La registrazione e temporaneamente disabilitata. Riprova piu tardi.";
  }

  if (normalized.includes("email rate limit exceeded") || normalized.includes("over_email_send_rate_limit")) {
    return "Hai effettuato troppi tentativi in poco tempo. Attendi qualche minuto e riprova.";
  }

  if (normalized.includes("unable to validate email address") || normalized.includes("invalid email")) {
    return "L'indirizzo email inserito non e valido.";
  }

  if (normalized.includes("network") || normalized.includes("failed to fetch")) {
    return "Connessione non disponibile. Verifica la rete e riprova.";
  }

  return "Non e stato possibile completare la registrazione in questo momento. Riprova tra qualche minuto.";
}

export default function RegistrazionePage() {
  const router = useRouter();
  const [values, setValues] = useState<FormState>({
    companyName: "",
    vatNumber: "",
    contactName: "",
    email: "",
    phone: "",
    whatsappPhone: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [serverMessage, setServerMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (state: FormState) => {
    const newErrors: FormErrors = {};

    if (!state.companyName.trim()) newErrors.companyName = "Inserisci la ragione sociale.";

    if (!state.vatNumber.trim()) {
      newErrors.vatNumber = "Inserisci la Partita IVA.";
    } else if (!/^IT\d{11}$/.test(state.vatNumber.trim())) {
      newErrors.vatNumber = "Inserisci una Partita IVA valida nel formato IT12345678901.";
    }

    if (!state.contactName.trim()) newErrors.contactName = "Inserisci il nome del referente.";
    if (!state.email.trim()) {
      newErrors.email = "Inserisci l'indirizzo email.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) {
      newErrors.email = "Inserisci un indirizzo email valido.";
    }

    if (!state.phone.trim()) newErrors.phone = "Inserisci un numero di telefono.";
    if (!state.password) {
      newErrors.password = "Inserisci una password.";
    } else if (state.password.length < 8) {
      newErrors.password = "La password deve avere almeno 8 caratteri.";
    }

    if (!state.confirmPassword) {
      newErrors.confirmPassword = "Conferma la password.";
    } else if (state.confirmPassword !== state.password) {
      newErrors.confirmPassword = "Le password non corrispondono.";
    }

    return newErrors;
  };

  const handleChange =
    (field: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues({ ...values, [field]: event.target.value });
      setErrors({ ...errors, [field]: undefined });
      setSuccessMessage("");
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationErrors = validate(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setSuccessMessage("");
      return;
    }

    setErrors({});
    setSuccessMessage("");
    setServerMessage("");
    setIsSubmitting(true);

    const email = values.email.trim().toLowerCase();
    const password = values.password;

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          legal_company_name: values.companyName.trim(),
          vat_number: values.vatNumber.trim(),
          contact_name: values.contactName.trim(),
          phone: values.phone.trim(),
          whatsapp_phone: values.whatsappPhone.trim(),
        },
      },
    });

    if (authError) {
      setServerMessage(translateSupabaseAuthError(authError.message));
      setIsSubmitting(false);
      return;
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setSuccessMessage("Account creato con successo. Effettua il login per completare la configurazione.");
      setServerMessage("");
      setIsSubmitting(false);
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setServerMessage(translateSupabaseAuthError(sessionError?.message || "Sessione non valida dopo la registrazione."));
      setIsSubmitting(false);
      return;
    }

    const ensureResponse = await fetch("/api/dealer/ensure", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        legal_company_name: values.companyName,
        vat_number: values.vatNumber,
        contact_person: values.contactName,
        email,
        phone: values.phone,
        whatsapp_phone: values.whatsappPhone,
      }),
    });

    if (!ensureResponse.ok) {
      const payload = (await ensureResponse.json().catch(() => ({}))) as { error?: string };
      setServerMessage(payload.error || "Registrazione completata ma associazione concessionaria non riuscita.");
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage("Account creato con successo. Reindirizzamento alla dashboard...");
    setServerMessage("");
    setIsSubmitting(false);
    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.25)]">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="bg-slate-950 px-8 py-10 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
            <div className="max-w-xl">
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-400">Dealer Registration</p>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Registra la tua concessionaria</h1>
              <p className="mt-6 text-base leading-7 text-slate-300 sm:text-lg">
                Crea un account premium per gestire vendite, contatti e opportunità in modo semplice e professionale.
              </p>

              <div className="mt-10 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl">
                <div>
                  <p className="text-sm font-medium text-white">Pronto per il lancio</p>
                  <p className="mt-2 text-sm text-slate-300">
                    La pagina è stata progettata per adattarsi ai display desktop e mobile con un&apos;interfaccia elegante e moderna.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl bg-slate-900/70 p-4">
                    <p className="text-sm font-semibold text-white">Design Premium</p>
                    <p className="mt-2 text-sm text-slate-400">Layout bilanciato e attenzione ai dettagli per un’esperienza professionale.</p>
                  </div>
                  <div className="rounded-3xl bg-slate-900/70 p-4">
                    <p className="text-sm font-semibold text-white">Pronto per Supabase</p>
                    <p className="mt-2 text-sm text-slate-400">I dati sono raccolti e validati prima dell’invio al backend.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
            <div className="mx-auto max-w-2xl">
              <div className="mb-8">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">Creazione account</p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Dati concessionaria</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">Compila le informazioni per iniziare. Tutti i campi sono obbligatori.</p>
              </div>

              <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="companyName" className="mb-2 block text-sm font-medium text-slate-700">Ragione sociale</label>
                    <input
                      id="companyName"
                      type="text"
                      value={values.companyName}
                      onChange={handleChange("companyName")}
                      placeholder="Ragione sociale"
                      className={`w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        errors.companyName ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {errors.companyName ? <p className="mt-2 text-sm text-red-600">{errors.companyName}</p> : null}
                  </div>

                  <div>
                    <label htmlFor="vatNumber" className="mb-2 block text-sm font-medium text-slate-700">Partita IVA</label>
                    <input
                      id="vatNumber"
                      type="text"
                      value={values.vatNumber}
                      onChange={handleChange("vatNumber")}
                      placeholder="IT12345678901"
                      className={`w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        errors.vatNumber ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {errors.vatNumber ? <p className="mt-2 text-sm text-red-600">{errors.vatNumber}</p> : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="contactName" className="mb-2 block text-sm font-medium text-slate-700">Referente</label>
                    <input
                      id="contactName"
                      type="text"
                      value={values.contactName}
                      onChange={handleChange("contactName")}
                      placeholder="Nome referente"
                      className={`w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        errors.contactName ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {errors.contactName ? <p className="mt-2 text-sm text-red-600">{errors.contactName}</p> : null}
                  </div>

                  <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email commerciale</label>
                    <input
                      id="email"
                      type="email"
                      value={values.email}
                      onChange={handleChange("email")}
                      placeholder="referente@azienda.it"
                      className={`w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        errors.email ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {errors.email ? <p className="mt-2 text-sm text-red-600">{errors.email}</p> : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-700">Telefono</label>
                    <input
                      id="phone"
                      type="tel"
                      value={values.phone}
                      onChange={handleChange("phone")}
                      placeholder="+39 333 123 4567"
                      className={`w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        errors.phone ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {errors.phone ? <p className="mt-2 text-sm text-red-600">{errors.phone}</p> : null}
                  </div>

                  <div>
                    <label htmlFor="whatsappPhone" className="mb-2 block text-sm font-medium text-slate-700">Numero WhatsApp</label>
                    <input
                      id="whatsappPhone"
                      type="tel"
                      value={values.whatsappPhone}
                      onChange={handleChange("whatsappPhone")}
                      placeholder="+39 333 123 4567"
                      className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                    <input
                      id="password"
                      type="password"
                      value={values.password}
                      onChange={handleChange("password")}
                      placeholder="Password"
                      className={`w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        errors.password ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {errors.password ? <p className="mt-2 text-sm text-red-600">{errors.password}</p> : null}
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700">Conferma password</label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={values.confirmPassword}
                      onChange={handleChange("confirmPassword")}
                      placeholder="Conferma password"
                      className={`w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        errors.confirmPassword ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {errors.confirmPassword ? <p className="mt-2 text-sm text-red-600">{errors.confirmPassword}</p> : null}
                  </div>
                </div>

                {successMessage ? (
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div>
                ) : null}
                {serverMessage ? (
                  <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverMessage}</div>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`inline-flex w-full justify-center rounded-3xl px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition focus:outline-none focus:ring-4 focus:ring-blue-200 ${
                    isSubmitting ? "cursor-not-allowed bg-blue-400 hover:bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {isSubmitting ? "Creazione in corso..." : "Crea account"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
