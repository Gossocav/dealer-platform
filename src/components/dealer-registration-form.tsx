"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export type DealerRegistrationPlan = "base" | "pro";

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

type PasswordChecklist = {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
};

type DealerRegistrationFormProps = {
  plan: DealerRegistrationPlan;
};

function evaluatePassword(password: string): PasswordChecklist {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
  };
}

function isPasswordValid(checklist: PasswordChecklist) {
  return checklist.minLength && checklist.hasUppercase && checklist.hasLowercase && checklist.hasNumber;
}

function translateSupabaseAuthError(rawMessage: string | null | undefined) {
  const message = String(rawMessage ?? "").trim();
  const normalized = message.toLowerCase();

  if (!normalized) {
    return "Si e verificato un errore di autenticazione. Riprova tra qualche istante.";
  }

  if (normalized.includes("user already registered")) {
    return "Questa email risulta gia registrata. Prova ad accedere o usa un altro indirizzo email.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "Credenziali non valide. Controlla email e password e riprova.";
  }

  if (normalized.includes("password should be at least")) {
    return "La password e troppo corta. Usa almeno 8 caratteri.";
  }

  if (
    normalized.includes("password should contain") ||
    normalized.includes("must contain") ||
    normalized.includes("uppercase") ||
    normalized.includes("lowercase") ||
    normalized.includes("number")
  ) {
    return "La password deve avere almeno 8 caratteri, una maiuscola, una minuscola e un numero.";
  }

  if (normalized.includes("weak password") || normalized.includes("weak_password") || normalized.includes("password is too weak")) {
    return "La password e troppo debole. Usa almeno 8 caratteri, una maiuscola, una minuscola e un numero.";
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

  if (normalized.includes("missing") || normalized.includes("required") || normalized.includes("null value")) {
    return "Compila tutti i campi obbligatori e riprova.";
  }

  if (normalized.includes("network") || normalized.includes("failed to fetch")) {
    return "Connessione non disponibile. Verifica la rete e riprova.";
  }

  return "Non e stato possibile completare la registrazione in questo momento. Riprova tra qualche minuto.";
}

export function DealerRegistrationForm({ plan }: DealerRegistrationFormProps) {
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordChecklist = evaluatePassword(values.password);
  const passwordIsValid = isPasswordValid(passwordChecklist);
  const canSubmit = !isSubmitting && passwordIsValid;

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
    } else {
      const checks = evaluatePassword(state.password);
      if (!isPasswordValid(checks)) {
        newErrors.password = "La password deve avere almeno 8 caratteri, una maiuscola, una minuscola e un numero.";
      }
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
          subscription_plan: plan,
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
        subscription_plan: plan,
        subscription_status: "pending_activation",
      }),
    });

    if (!ensureResponse.ok) {
      const payload = (await ensureResponse.json().catch(() => ({}))) as { error?: string };
      setServerMessage(payload.error || "Registrazione completata ma associazione concessionaria non riuscita.");
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage("Richiesta inviata correttamente. Il tuo account e in verifica.");
    setServerMessage("");
    setIsSubmitting(false);
    router.replace("/account/in-attesa");
    router.refresh();
  };

  const selectedPlanLabel = plan === "base" ? "Base" : "Pro";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">Creazione account</p>
        <h2 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Dati concessionaria</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">Compila le informazioni per iniziare. Tutti i campi sono obbligatori.</p>
        <p className="mt-3 text-sm text-slate-700">
          Piano selezionato: <span className="font-semibold text-slate-900">{selectedPlanLabel}</span>
        </p>
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
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={values.password}
                onChange={handleChange("password")}
                placeholder="Password"
                className={`w-full rounded-3xl border px-4 py-3 pr-12 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                  errors.password ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                className="absolute inset-y-0 right-0 inline-flex items-center justify-center px-4 text-slate-500 transition hover:text-slate-700"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" />
                    <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                    <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7a12.12 12.12 0 0 1-4.35 5.09" />
                    <path d="M6.61 6.61A12.26 12.26 0 0 0 1 12c1.73 3.89 6 7 11 7a10.94 10.94 0 0 0 5.09-1.12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {errors.password ? <p className="mt-2 text-sm text-red-600">{errors.password}</p> : null}
            <ul className="mt-3 space-y-1 text-xs text-slate-600" aria-live="polite">
              <li className={passwordChecklist.minLength ? "text-emerald-700" : "text-slate-600"}>
                {passwordChecklist.minLength ? "✓" : "○"} Minimo 8 caratteri
              </li>
              <li className={passwordChecklist.hasUppercase ? "text-emerald-700" : "text-slate-600"}>
                {passwordChecklist.hasUppercase ? "✓" : "○"} Una lettera maiuscola
              </li>
              <li className={passwordChecklist.hasLowercase ? "text-emerald-700" : "text-slate-600"}>
                {passwordChecklist.hasLowercase ? "✓" : "○"} Una lettera minuscola
              </li>
              <li className={passwordChecklist.hasNumber ? "text-emerald-700" : "text-slate-600"}>
                {passwordChecklist.hasNumber ? "✓" : "○"} Un numero
              </li>
            </ul>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700">Conferma password</label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={values.confirmPassword}
                onChange={handleChange("confirmPassword")}
                placeholder="Conferma password"
                className={`w-full rounded-3xl border px-4 py-3 pr-12 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                  errors.confirmPassword ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? "Nascondi conferma password" : "Mostra conferma password"}
                className="absolute inset-y-0 right-0 inline-flex items-center justify-center px-4 text-slate-500 transition hover:text-slate-700"
              >
                {showConfirmPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" />
                    <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                    <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7a12.12 12.12 0 0 1-4.35 5.09" />
                    <path d="M6.61 6.61A12.26 12.26 0 0 0 1 12c1.73 3.89 6 7 11 7a10.94 10.94 0 0 0 5.09-1.12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
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
          disabled={!canSubmit}
          className={`inline-flex w-full justify-center rounded-3xl px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition focus:outline-none focus:ring-4 focus:ring-blue-200 ${
            !canSubmit ? "cursor-not-allowed bg-blue-400 hover:bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isSubmitting ? "Registrazione in corso..." : "Registrati"}
        </button>
      </form>
    </section>
  );
}
