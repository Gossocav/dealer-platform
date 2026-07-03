"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { formatCurrency, safeText } from "@/lib/vehicles";

type SendMode = "email" | "whatsapp" | "copy-link";

type SendToClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: {
    brand?: string | null;
    model?: string | null;
    version?: string | null;
    year?: string | number | null;
    price?: string | number | null;
  };
};

function buildMessage(vehicle: SendToClientDialogProps["vehicle"]): string {
  const brand = safeText(vehicle.brand);
  const model = safeText(vehicle.model);
  const version = safeText(vehicle.version);
  const year = safeText(vehicle.year);
  const rawPrice = Number(vehicle.price ?? 0);
  const price = Number.isFinite(rawPrice) && rawPrice > 0 ? formatCurrency(rawPrice) : "Su richiesta";

  return [
    "Buongiorno,",
    "",
    "Le invio il veicolo che potrebbe interessarle.",
    "",
    `${brand} ${model}`.trim(),
    "",
    "Versione:",
    version,
    "",
    "Anno:",
    year,
    "",
    "Prezzo:",
    price,
    "",
    "Per qualsiasi informazione resto a disposizione.",
    "",
    "Cordiali saluti.",
  ].join("\n");
}

function getFieldClass(): string {
  return "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300";
}

export function SendToClientDialog({ open, onOpenChange, vehicle }: SendToClientDialogProps) {
  const defaultMessage = useMemo(() => buildMessage(vehicle), [vehicle]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<SendMode>("email");
  const [message, setMessage] = useState(defaultMessage);

  useEffect(() => {
    if (!open) return;

    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setMode("email");
    setMessage(defaultMessage);
  }, [defaultMessage, open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="send-to-client-title">
      <div className="absolute inset-0" onClick={() => onOpenChange(false)} aria-hidden="true" />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.45)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Invia al cliente</p>
            <h2 id="send-to-client-title" className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">
              Invia al cliente
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="Chiudi finestra"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nome *</span>
              <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className={getFieldClass()} type="text" required />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cognome *</span>
              <input value={lastName} onChange={(event) => setLastName(event.target.value)} className={getFieldClass()} type="text" required />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} className={getFieldClass()} type="email" />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Telefono / WhatsApp</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} className={getFieldClass()} type="text" inputMode="tel" />
            </label>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Modalita invio</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">
                <input type="radio" name="send-mode" checked={mode === "email"} onChange={() => setMode("email")} className="h-4 w-4 border-slate-300 text-slate-900" />
                Email
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">
                <input type="radio" name="send-mode" checked={mode === "whatsapp"} onChange={() => setMode("whatsapp")} className="h-4 w-4 border-slate-300 text-slate-900" />
                WhatsApp
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">
                <input type="radio" name="send-mode" checked={mode === "copy-link"} onChange={() => setMode("copy-link")} className="h-4 w-4 border-slate-300 text-slate-900" />
                Copia link
              </label>
            </div>
          </div>

          <label className="mt-6 block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Messaggio</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={14}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-300"
            />
          </label>
        </div>

        <div className="border-t border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Funzione disponibile nella prossima versione.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white opacity-50 disabled:cursor-not-allowed"
              >
                Invia
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}