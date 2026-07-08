"use client";

import { useState } from "react";

type DemoFormState = {
  dealerName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  vehicleCount: string;
  message: string;
};

const initialValues: DemoFormState = {
  dealerName: "",
  contactName: "",
  email: "",
  phone: "",
  city: "",
  vehicleCount: "",
  message: "",
};

export default function DemoPage() {
  const [values, setValues] = useState<DemoFormState>(initialValues);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange =
    (field: keyof DemoFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setIsSubmitted(false);
    };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitted(true);
    setValues(initialValues);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-4xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.25)] sm:p-8 lg:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">Demo</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">Richiedi una demo gratuita</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
          Compila il modulo e ti ricontatteremo per mostrarti come Dealer Platform puo supportare la tua concessionaria.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="dealerName" className="mb-2 block text-sm font-medium text-slate-700">Nome concessionaria</label>
              <input
                id="dealerName"
                type="text"
                required
                value={values.dealerName}
                onChange={handleChange("dealerName")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="contactName" className="mb-2 block text-sm font-medium text-slate-700">Nome e cognome referente</label>
              <input
                id="contactName"
                type="text"
                required
                value={values.contactName}
                onChange={handleChange("contactName")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
              <input
                id="email"
                type="email"
                required
                value={values.email}
                onChange={handleChange("email")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-700">Telefono</label>
              <input
                id="phone"
                type="tel"
                required
                value={values.phone}
                onChange={handleChange("phone")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className="mb-2 block text-sm font-medium text-slate-700">Citta</label>
              <input
                id="city"
                type="text"
                required
                value={values.city}
                onChange={handleChange("city")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="vehicleCount" className="mb-2 block text-sm font-medium text-slate-700">Numero veicoli indicativo</label>
              <input
                id="vehicleCount"
                type="text"
                required
                value={values.vehicleCount}
                onChange={handleChange("vehicleCount")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="message" className="mb-2 block text-sm font-medium text-slate-700">Messaggio facoltativo</label>
            <textarea
              id="message"
              rows={4}
              value={values.message}
              onChange={handleChange("message")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          {isSubmitted ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              Richiesta demo inviata. Ti ricontatteremo al piu presto.
            </div>
          ) : null}

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            Invia richiesta demo
          </button>
        </form>
      </section>
    </main>
  );
}
