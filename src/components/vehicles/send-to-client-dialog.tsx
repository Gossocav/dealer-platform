"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { formatCurrency, safeText } from "@/lib/vehicles";

type SendMode = "email" | "whatsapp" | "copy-link";

type SendToClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: {
    id: string;
    coverImageUrl?: string | null;
    brand?: string | null;
    model?: string | null;
    version?: string | null;
    year?: string | number | null;
    mileage?: string | number | null;
    fuel?: string | null;
    transmission?: string | null;
    price?: string | number | null;
  };
};

type SendToClientApiResponse = {
  message?: string;
  error?: string;
};

function buildMessage(vehicle: SendToClientDialogProps["vehicle"], publicUrl: string): string {
  const brand = safeText(vehicle.brand);
  const model = safeText(vehicle.model);
  const version = safeText(vehicle.version);
  const year = safeText(vehicle.year);
  const mileage = formatMileage(vehicle.mileage);
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
    "Km:",
    mileage,
    "",
    "Prezzo:",
    price,
    "",
    "Link annuncio:",
    publicUrl,
    "",
    "Per qualsiasi informazione resto a disposizione.",
    "",
    "Cordiali saluti.",
  ].join("\n");
}

function getFieldClass(missing = false): string {
  return `h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 outline-none transition ${missing ? "border-red-300 bg-red-50 focus:border-red-400" : "border-slate-200 focus:border-sky-300"}`;
}

function getTextAreaClass(): string {
  return "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-300";
}

function getToastClass(kind: "success" | "error"): string {
  return `pointer-events-none absolute right-5 top-5 z-20 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)] ${kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const withPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return withPrefix ? `+${digits}` : digits;
}

function toWhatsAppNumber(phone: string): string {
  const normalized = normalizePhone(phone);
  return normalized.replace(/^\+/, "");
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function formatMileage(value: string | number | null | undefined): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    const fallback = safeText(value);
    return fallback === "-" ? "Non specificati" : fallback;
  }

  return `${new Intl.NumberFormat("it-IT").format(numericValue)} km`;
}

function isMobileShareAvailable() {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function SendToClientDialog({ open, onOpenChange, vehicle }: SendToClientDialogProps) {
  const publicUrl = useMemo(() => {
    const relativeUrl = `/auto/${vehicle.id}`;
    if (typeof window === "undefined") {
      return relativeUrl;
    }

    return `${window.location.origin}${relativeUrl}`;
  }, [vehicle.id]);
  const defaultMessage = useMemo(() => buildMessage(vehicle, publicUrl), [publicUrl, vehicle]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<SendMode>("email");
  const [message, setMessage] = useState(defaultMessage);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const firstNameValue = firstName.trim();
  const lastNameValue = lastName.trim();
  const emailValue = normalizeEmail(email);
  const phoneValue = phone.trim();

  const missingFirstName = firstNameValue.length === 0;
  const missingLastName = lastNameValue.length === 0;
  const missingEmail = mode === "email" && emailValue.length === 0;
  const missingPhone = mode === "whatsapp" && phoneValue.length === 0;
  const canSubmit = !missingFirstName && !missingLastName && !missingEmail && !missingPhone && !submitting;

  const shareMessage = useMemo(() => {
    const rawPrice = Number(vehicle.price ?? 0);
    const price = Number.isFinite(rawPrice) && rawPrice > 0 ? formatCurrency(rawPrice) : "Su richiesta";
    return [
      `Marca: ${safeText(vehicle.brand)}`,
      `Modello: ${safeText(vehicle.model)}`,
      `Versione: ${safeText(vehicle.version)}`,
      `Anno: ${safeText(vehicle.year)}`,
      `Km: ${formatMileage(vehicle.mileage)}`,
      `Prezzo: ${price}`,
      `Link annuncio: ${publicUrl}`,
    ]
      .filter((item) => item.length > 0)
      .join("\n");
  }, [publicUrl, vehicle]);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setMode("email");
      setMessage(defaultMessage);
      setSubmitting(false);
      setErrorMessage(null);
      setSuccessMessage(null);
      setToast(null);
    }
  }

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

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

  const handleSubmit = async () => {
    if (!canSubmit) {
      setErrorMessage("Compila i campi obbligatori per continuare.");
      setSuccessMessage(null);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (mode === "copy-link") {
        await copyTextToClipboard(publicUrl);
        setSuccessMessage(null);
        setToast({ kind: "success", message: "Link copiato negli appunti." });
        return;
      }

      if (mode === "whatsapp") {
        if (isMobileShareAvailable()) {
          await navigator.share({
            title: `${safeText(vehicle.brand)} ${safeText(vehicle.model)}`.trim(),
            text: shareMessage,
            url: publicUrl,
          });
          setSuccessMessage("✓ Veicolo inviato con successo.");
          return;
        }

        const normalizedPhone = toWhatsAppNumber(phoneValue);
        const whatsappUrl = normalizedPhone.length > 0
          ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(shareMessage)}`
          : `https://web.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`;

        window.open(whatsappUrl, "_blank", "noopener,noreferrer");
        setSuccessMessage("✓ Veicolo inviato con successo.");
        return;
      }

      const response = await fetch("/api/vehicles/send-to-client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vehicleId: vehicle.id,
          firstName: firstNameValue,
          lastName: lastNameValue,
          email: emailValue,
          phone: phoneValue,
          message,
          publicUrl,
          coverImageUrl: vehicle.coverImageUrl,
          brand: safeText(vehicle.brand),
          model: safeText(vehicle.model),
          version: safeText(vehicle.version),
          year: safeText(vehicle.year),
          mileage: formatMileage(vehicle.mileage),
          fuel: safeText(vehicle.fuel),
          transmission: safeText(vehicle.transmission),
          price: Number.isFinite(Number(vehicle.price ?? 0)) && Number(vehicle.price ?? 0) > 0 ? formatCurrency(Number(vehicle.price ?? 0)) : "Su richiesta",
        }),
      });

      const payload = (await response.json().catch(() => null)) as SendToClientApiResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Invio email non riuscito.");
      }

      setSuccessMessage("✓ Veicolo inviato con successo.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setErrorMessage("Condivisione annullata.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Operazione non riuscita.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="send-to-client-title">
      <div className="absolute inset-0" onClick={() => onOpenChange(false)} aria-hidden="true" />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.45)]">
        {toast ? <div className={getToastClass(toast.kind)}>{toast.message}</div> : null}
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
          {errorMessage ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errorMessage}</div> : null}
          {successMessage ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{successMessage}</div> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nome *</span>
              <input
                value={firstName}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  setErrorMessage(null);
                }}
                className={getFieldClass(missingFirstName)}
                type="text"
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cognome *</span>
              <input
                value={lastName}
                onChange={(event) => {
                  setLastName(event.target.value);
                  setErrorMessage(null);
                }}
                className={getFieldClass(missingLastName)}
                type="text"
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Email{mode === "email" ? " *" : ""}</span>
              <input
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrorMessage(null);
                }}
                className={getFieldClass(missingEmail)}
                type="email"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Telefono / WhatsApp{mode === "whatsapp" ? " *" : ""}</span>
              <input
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setErrorMessage(null);
                }}
                className={getFieldClass(missingPhone)}
                type="text"
                inputMode="tel"
              />
            </label>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Modalita invio</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">
                <input
                  type="radio"
                  name="send-mode"
                  checked={mode === "email"}
                  onChange={() => {
                    setMode("email");
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setToast(null);
                  }}
                  className="h-4 w-4 border-slate-300 text-slate-900"
                />
                Email
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">
                <input
                  type="radio"
                  name="send-mode"
                  checked={mode === "whatsapp"}
                  onChange={() => {
                    setMode("whatsapp");
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setToast(null);
                  }}
                  className="h-4 w-4 border-slate-300 text-slate-900"
                />
                WhatsApp
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700">
                <input
                  type="radio"
                  name="send-mode"
                  checked={mode === "copy-link"}
                  onChange={() => {
                    setMode("copy-link");
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setToast(null);
                  }}
                  className="h-4 w-4 border-slate-300 text-slate-900"
                />
                Copia link
              </label>
            </div>
          </div>

          <label className="mt-6 block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Messaggio</span>
            <textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setErrorMessage(null);
              }}
              rows={14}
              className={getTextAreaClass()}
            />
          </label>
        </div>

        <div className="border-t border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              {mode === "copy-link" ? "Viene copiato il link pubblico marketplace del veicolo." : "Nessun lead o dato CRM verra creato da questa azione."}
            </p>
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
                onClick={() => {
                  void handleSubmit();
                }}
                disabled={!canSubmit}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Invio..." : "Invia"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}