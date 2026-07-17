"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type PortalPayload = {
  customer: {
    fullName: string;
    email: string | null;
    phone: string | null;
  };
  lead: {
    id: string;
    status: string;
    statusLabel: string;
    message: string | null;
    createdAt: string | null;
  };
  vehicle: {
    label: string;
  };
  appointments: Array<{
    id: string;
    title: string;
    when: string;
    status: string;
    statusLabel: string;
  }>;
  publicNotes: Array<{
    id: string;
    source: string;
    text: string;
    createdAt: string | null;
  }>;
};

function formatDate(value: string | null) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ClientPortalLeadPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const leadId = String(params.leadId ?? "").trim();
  const email = String(searchParams.get("email") ?? "").trim();
  const token = String(searchParams.get("t") ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<PortalPayload | null>(null);

  useEffect(() => {
    const loadPortal = async () => {
      setLoading(true);
      setError(null);

      if (!leadId || !email || !token) {
        setPayload(null);
        setError("Link portale non valido o incompleto.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/client-portal/lead/${encodeURIComponent(leadId)}?email=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`);
        const data = (await response.json().catch(() => null)) as PortalPayload & { error?: string };

        if (!response.ok) {
          setPayload(null);
          setError(data?.error || "Impossibile caricare il portale cliente.");
          setLoading(false);
          return;
        }

        setPayload(data as PortalPayload);
      } catch {
        setPayload(null);
        setError("Errore di rete durante il caricamento del portale cliente.");
      } finally {
        setLoading(false);
      }
    };

    void loadPortal();
  }, [email, leadId, token]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 px-4 py-8 sm:px-6 lg:px-10">
      <section className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Portale cliente</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Aggiornamento pratica</h1>
          <p className="mt-2 text-sm text-slate-600">Consulta stato, appuntamenti e note pubbliche condivise dal concessionario.</p>
        </header>

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">Caricamento portale cliente...</section>
        ) : null}

        {!loading && error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">{error}</section>
        ) : null}

        {!loading && payload ? (
          <>
            <section className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Dati cliente</h2>
                <p className="mt-3 text-lg font-semibold text-slate-900">{payload.customer.fullName}</p>
                <p className="mt-1 text-sm text-slate-600">Email: {payload.customer.email || "-"}</p>
                <p className="mt-1 text-sm text-slate-600">Telefono: {payload.customer.phone || "-"}</p>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Stato pratica</h2>
                <p className="mt-3 inline-flex rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-700">{payload.lead.statusLabel}</p>
                <p className="mt-3 text-sm text-slate-600">Richiesta del: {formatDate(payload.lead.createdAt)}</p>
                <p className="mt-1 text-sm text-slate-600">Veicolo: {payload.vehicle.label}</p>
              </article>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Messaggio iniziale</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700">{payload.lead.message?.trim() ? payload.lead.message : "Nessun messaggio disponibile."}</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Appuntamenti collegati</h2>
              {payload.appointments.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">Nessun appuntamento disponibile al momento.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {payload.appointments.map((appointment) => (
                    <div key={appointment.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{appointment.title}</p>
                        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">{appointment.statusLabel}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{appointment.when}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Note condivise</h2>
              <p className="mt-2 text-xs text-slate-500">Sono visibili solo le note marcate come pubbliche dal concessionario.</p>
              {payload.publicNotes.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">Nessuna nota pubblica disponibile.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {payload.publicNotes.map((note) => (
                    <li key={note.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-sm text-slate-700">{note.text}</p>
                      <p className="mt-1 text-xs text-slate-500">Aggiornata il {formatDate(note.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
