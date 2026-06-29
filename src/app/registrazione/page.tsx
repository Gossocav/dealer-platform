"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type FormState = {
  dealerName: string;
  companyName: string;
  vatNumber: string;
  taxCode: string;
  contactName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

export default function RegistrazionePage() {
  const [values, setValues] = useState<FormState>({
    dealerName: "",
    companyName: "",
    vatNumber: "",
    taxCode: "",
    contactName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [serverMessage, setServerMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (state: FormState) => {
    const newErrors: FormErrors = {};

    if (!state.dealerName.trim()) newErrors.dealerName = "Inserisci il nome della concessionaria.";
    if (!state.companyName.trim()) newErrors.companyName = "Inserisci la ragione sociale.";

    if (!state.vatNumber.trim()) {
      newErrors.vatNumber = "Inserisci la Partita IVA.";
    } else if (!/^IT\d{11}$/.test(state.vatNumber.trim())) {
      newErrors.vatNumber = "Inserisci una Partita IVA valida nel formato IT12345678901.";
    }

    if (!state.taxCode.trim()) {
      newErrors.taxCode = "Inserisci il Codice Fiscale.";
    } else if (!/^[A-Z0-9]{16}$/i.test(state.taxCode.trim())) {
      newErrors.taxCode = "Inserisci un Codice Fiscale valido di 16 caratteri.";
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
          dealer_name: values.dealerName.trim(),
          company_name: values.companyName.trim(),
          vat_number: values.vatNumber.trim(),
          fiscal_code: values.taxCode.trim(),
          contact_name: values.contactName.trim(),
          phone: values.phone.trim(),
        },
      },
    });

    if (authError) {
      setServerMessage(authError.message);
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage("Account creato con successo. Controlla la tua email per confermare.");
    setServerMessage("");
    setIsSubmitting(false);
    setValues({
      dealerName: "",
      companyName: "",
      vatNumber: "",
      taxCode: "",
      contactName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    });
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
                    <label htmlFor="dealerName" className="mb-2 block text-sm font-medium text-slate-700">Company Name</label>
                    <input
                      id="dealerName"
                      type="text"
                      value={values.dealerName}
                      onChange={handleChange("dealerName")}
                      placeholder="Nome concessionaria"
                      className={`w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        errors.dealerName ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {errors.dealerName ? <p className="mt-2 text-sm text-red-600">{errors.dealerName}</p> : null}
                  </div>

                  <div>
                    <label htmlFor="companyName" className="mb-2 block text-sm font-medium text-slate-700">Legal Company Name</label>
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
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="vatNumber" className="mb-2 block text-sm font-medium text-slate-700">VAT Number</label>
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

                  <div>
                    <label htmlFor="taxCode" className="mb-2 block text-sm font-medium text-slate-700">Tax Code</label>
                    <input
                      id="taxCode"
                      type="text"
                      value={values.taxCode}
                      onChange={handleChange("taxCode")}
                      placeholder="Codice fiscale"
                      className={`w-full rounded-3xl border px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${
                        errors.taxCode ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                      }`}
                    />
                    {errors.taxCode ? <p className="mt-2 text-sm text-red-600">{errors.taxCode}</p> : null}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="contactName" className="mb-2 block text-sm font-medium text-slate-700">Contact Person</label>
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
                    <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
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
                    <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-700">Phone</label>
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
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700">Confirm Password</label>
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
