"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Lead = {
  id: string;
  customer_type: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  status: string | null;
  created_at: string | null;
  vehicle: {
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | null;
  } | null;
};

export default function LeadDetailPage() {
  const params = useParams();
  const leadId = String(params.id);

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");

  useEffect(() => {
    const loadLead = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, customer_type, first_name, last_name, email, phone, message, status, created_at, vehicle:vehicles(brand, model, version, year)"
        )
        .eq("id", leadId)
        .maybeSingle();

      if (!error && data) {
        const normalizedVehicle = Array.isArray(data.vehicle)
          ? data.vehicle[0] ?? null
          : data.vehicle;

        const normalizedLead: Lead = {
          ...data,
          vehicle: normalizedVehicle,
        };

        setLead(normalizedLead);
      }

      setLoading(false);
    };

    void loadLead();
  }, [leadId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#dbeafe_0%,#f8fafc_42%,#f8fafc_100%)] p-8">
        <p>Caricamento lead...</p>
      </main>
    );
  }

  if (!lead) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#dbeafe_0%,#f8fafc_42%,#f8fafc_100%)] p-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold">Lead non trovato</h1>

          <Link
            href="/lead"
            className="mt-6 inline-block rounded-3xl bg-blue-600 px-5 py-3 text-white"
          >
            Torna ai Lead
          </Link>
        </div>
      </main>
    );
  }

  const fullName =
    `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() ||
    "Cliente";

  const vehicleLabel = [
    lead.vehicle?.brand,
    lead.vehicle?.model,
    lead.vehicle?.version,
    lead.vehicle?.year,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#dbeafe_0%,#f8fafc_42%,#f8fafc_100%)] px-4 py-8 lg:px-8">

      <div className="mx-auto max-w-7xl space-y-6">

        <div className="rounded-[32px] bg-slate-950 p-8 text-white shadow-xl">

          <p className="text-xs uppercase tracking-[0.35em] text-blue-300">
            CRM LEAD
          </p>

          <h1 className="mt-4 text-4xl font-bold">
            {fullName}
          </h1>

          <p className="mt-3 text-slate-300">
            {vehicleLabel}
          </p>

        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">

          <section className="space-y-6">

            <Card title="Dati Cliente">

              <Info
                label="Tipo cliente"
                value={formatCustomerType(lead.customer_type)}
              />

              <Info
                label="Nome"
                value={fullName}
              />

              <Info
                label="Email"
                value={lead.email}
              />

              <Info
                label="Telefono"
                value={lead.phone}
              />

              <Info
                label="Data richiesta"
                value={formatDate(lead.created_at)}
              />

            </Card>

            <Card title="Messaggio Cliente">

              <p className="text-sm leading-7 text-slate-700">

                {lead.message ||
                  "Nessun messaggio inserito."}

              </p>

            </Card>

            <Card title="Timeline">

              <TimelineItem
                title="Lead ricevuto"
                text="Richiesta acquisita."
              />

              <TimelineItem
                title="Primo contatto"
                text="Da effettuare."
                muted
              />

              <TimelineItem
                title="Preventivo"
                text="Da inviare."
                muted
              />

              <TimelineItem
                title="Vendita"
                text="In attesa."
                muted
              />

            </Card>

            <Card title="Note interne">

              <textarea
                value={note}
                onChange={(e) =>
                  setNote(e.target.value)
                }
                placeholder="Scrivi una nota..."
                className="min-h-32 w-full rounded-3xl border border-slate-200 bg-slate-50 p-4"
              />

              <p className="mt-3 text-xs text-slate-500">
                Le note saranno salvate nel database nel prossimo aggiornamento.
              </p>

            </Card>

          </section>
                    <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">

            <Card title="Stato commerciale">
              <span className="inline-flex rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
                {formatStatus(lead.status)}
              </span>
            </Card>

            <Card title="Azioni rapide">
              <div className="grid gap-3">

                {lead.phone ? (
                  <>
                    <a
                      href={`tel:${lead.phone}`}
                      className="rounded-3xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white"
                    >
                      Chiama cliente
                    </a>

                    <a
                      href={`https://wa.me/${cleanPhone(lead.phone)}?text=${encodeURIComponent(
                        `Buongiorno ${lead.first_name ?? ""}, la contatto per la richiesta su ${vehicleLabel}.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-3xl bg-green-600 px-5 py-3 text-center text-sm font-semibold text-white"
                    >
                      Scrivi WhatsApp
                    </a>
                  </>
                ) : null}

                {lead.email ? (
                  <a
                    href={`mailto:${lead.email}?subject=${encodeURIComponent(
                      `Richiesta informazioni ${vehicleLabel}`
                    )}`}
                    className="rounded-3xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white"
                  >
                    Invia email
                  </a>
                ) : null}

                <button className="rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
                  Crea appuntamento
                </button>

              </div>
            </Card>

            <Card title="Navigazione">
              <Link
                href="/lead"
                className="inline-flex rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700"
              >
                Torna alla lista lead
              </Link>
            </Card>

          </aside>

        </div>
      </div>
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">
        {title}
      </h2>
      <div className="mt-5 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">
        {value || "-"}
      </p>
    </div>
  );
}

function TimelineItem({
  title,
  text,
  muted,
}: {
  title: string;
  text: string;
  muted?: boolean;
}) {
  return (
    <div className="border-l-4 border-blue-600 pl-4">
      <p className={`font-semibold ${muted ? "text-slate-400" : "text-slate-900"}`}>
        {title}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {text}
      </p>
    </div>
  );
}

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

function formatStatus(value: string | null) {
  if (!value) return "Nuovo";

  const normalized = value.toLowerCase();

  const labels: Record<string, string> = {
    nuovo: "Nuovo",
    created: "Nuovo",
    contattato: "Contattato",
    contacted: "Contattato",
    trattativa: "Trattativa",
    negotiation: "Trattativa",
    appointment: "Appuntamento",
    venduto: "Venduto",
    won: "Venduto",
    perso: "Perso",
    lost: "Perso",
  };

  return labels[normalized] ?? value;
}

function cleanPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function formatCustomerType(value: string | null) {
  if (value === "azienda") return "Azienda";
  if (value === "privato") return "Privato";
  return null;
}