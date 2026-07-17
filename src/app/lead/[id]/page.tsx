"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { buildActiveDealerHeaders, getActiveDealerId } from "@/lib/active-tenant";
import { appointmentStatusBadgeClass, appointmentStatusLabel, mapAppointmentStatusToDb, normalizeAppointmentStatus, toIsoFromLocalDateTime, type AppointmentStatus, type LeadAppointmentItem } from "@/lib/appointments";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { isMissingColumnError, leadStageLabels, leadStages, listLeadActivities, mapStageToDbStatus, normalizeLeadStage, writeLeadActivity, type LeadActivityItem, type LeadStage } from "@/lib/leads";
import { supabase } from "@/lib/supabaseClient";

type Lead = {
  id: string;
  dealer_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  status: string | null;
  internal_notes?: string | null;
  created_at: string | null;
  vehicle: {
    id: string | null;
    brand: string | null;
    model: string | null;
    version: string | null;
    year: string | number | null;
  } | null;
};

export default function LeadDetailPage() {
  const params = useParams();
  const leadId = String(params.id);

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStage, setSavingStage] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activities, setActivities] = useState<LeadActivityItem[]>([]);
  const [appointments, setAppointments] = useState<LeadAppointmentItem[]>([]);
  const [appointmentAt, setAppointmentAt] = useState("");
  const [appointmentStatus, setAppointmentStatus] = useState<AppointmentStatus>("programmato");
  const [appointmentNotes, setAppointmentNotes] = useState("");
  const [linkVehicleToAppointment, setLinkVehicleToAppointment] = useState(true);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [generatingPortalLink, setGeneratingPortalLink] = useState(false);
  const [currentDealerId, setCurrentDealerId] = useState<string | null>(null);

  const loadLeadAppointments = async (dealerId: string, targetLeadId: string) => {
    const { data: rows, error: appointmentsError } = await supabase
      .from("appointments")
      .select("id, title, start_at, status, notes, description, vehicle_id")
      .eq("dealer_id", dealerId)
      .eq("lead_id", targetLeadId)
      .order("start_at", { ascending: false })
      .returns<Array<{
        id: string;
        title: string | null;
        start_at: string | null;
        status: string | null;
        notes: string | null;
        description: string | null;
        vehicle_id: string | null;
      }>>();

    if (appointmentsError) {
      return [];
    }

    return (rows ?? []).map((row) => ({
      id: row.id,
      title: String(row.title ?? "Appuntamento lead"),
      startAt: row.start_at,
      status: normalizeAppointmentStatus(row.status),
      notes: String(row.notes ?? row.description ?? "").trim(),
      vehicleId: row.vehicle_id,
    }));
  };

  useEffect(() => {
    const loadLead = async () => {
      setLoading(true);
      setError(null);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (authError || !userId) {
        setLead(null);
        setLoading(false);
        setError("Sessione non valida. Effettua di nuovo il login.");
        return;
      }

      const dealerId = await resolveDealerIdFromTenantSources(supabase, userId, {
        activeDealerId: getActiveDealerId(),
      });

      if (!dealerId) {
        setLead(null);
        setLoading(false);
        setError("Concessionaria non associata all'utente.");
        return;
      }

      setCurrentDealerId(dealerId);

      const selectWithNotes =
        "id, dealer_id, first_name, last_name, email, phone, message, status, internal_notes, created_at, vehicle:vehicles(id, brand, model, version, year)";
      const selectWithoutNotes =
        "id, dealer_id, first_name, last_name, email, phone, message, status, created_at, vehicle:vehicles(id, brand, model, version, year)";

      let data: Lead | null = null;
      let queryError: { message?: string } | null = null;

      const firstTry = await supabase
        .from("leads")
        .select(selectWithNotes)
        .eq("dealer_id", dealerId)
        .eq("id", leadId)
        .maybeSingle();

      if (firstTry.error && isMissingColumnError(firstTry.error.message, "internal_notes")) {
        const fallbackTry = await supabase
          .from("leads")
          .select(selectWithoutNotes)
          .eq("dealer_id", dealerId)
          .eq("id", leadId)
          .maybeSingle();

        data = (fallbackTry.data as Lead | null) ?? null;
        queryError = fallbackTry.error;
      } else {
        data = (firstTry.data as Lead | null) ?? null;
        queryError = firstTry.error;
      }

      if (!queryError && data) {
        const normalizedVehicle = Array.isArray(data.vehicle) ? data.vehicle[0] ?? null : data.vehicle;
        const normalizedLead: Lead = { ...data, vehicle: normalizedVehicle };

        setLead(normalizedLead);
        setNote(String(data.internal_notes ?? ""));

        const timeline = await listLeadActivities(supabase, dealerId, leadId, data.created_at);
        setActivities(timeline);

        const leadAppointments = await loadLeadAppointments(dealerId, leadId);
        setAppointments(leadAppointments);
      } else {
        setLead(null);
        setError(queryError?.message || "Lead non trovato o non autorizzato.");
      }

      setLoading(false);
    };

    void loadLead();
  }, [leadId]);

  if (loading) {
    return (
      <DealerDashboardShell title="Dettaglio Lead" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={0}>
        <section className="rounded-3xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">Caricamento lead...</section>
      </DealerDashboardShell>
    );
  }

  if (!lead) {
    return (
      <DealerDashboardShell title="Dettaglio Lead" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={0}>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Lead non trovato</h1>
          {error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <Link href="/lead" className="mt-6 inline-block rounded-3xl bg-blue-600 px-5 py-3 text-white">
            Torna ai Lead
          </Link>
        </section>
      </DealerDashboardShell>
    );
  }

  const handleStageChange = async (nextStage: LeadStage) => {
    setSavingStage(true);
    setError(null);

    const previousStage = normalizeLeadStage(lead.status);
    const dbStatus = mapStageToDbStatus(nextStage);

    const { data: updatedRows, error: updateError } = await supabase
      .from("leads")
      .update({ status: dbStatus })
      .eq("id", lead.id)
      .eq("dealer_id", lead.dealer_id)
      .select("id")
      .returns<Array<{ id: string }>>();

    if (updateError) {
      setError(updateError.message || "Errore aggiornamento stato lead.");
      setSavingStage(false);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      setError("Aggiornamento non consentito o lead non trovato.");
      setSavingStage(false);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const actorProfileId = authData.user?.id ?? null;

    if (currentDealerId) {
      await writeLeadActivity(supabase, {
        dealerId: currentDealerId,
        leadId: lead.id,
        activityType: "status_changed",
        note: `Stato aggiornato: ${leadStageLabels[previousStage]} -> ${leadStageLabels[nextStage]}`,
        actorProfileId,
      });
    }

    const refreshedTimeline = currentDealerId
      ? await listLeadActivities(supabase, currentDealerId, lead.id, lead.created_at)
      : activities;

    setLead((prev) => (prev ? { ...prev, status: dbStatus } : prev));
    setActivities(refreshedTimeline);
    setSavingStage(false);
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    setError(null);

    const { data: updatedRows, error: updateError } = await supabase
      .from("leads")
      .update({ internal_notes: note })
      .eq("id", lead.id)
      .eq("dealer_id", lead.dealer_id)
      .select("id")
      .returns<Array<{ id: string }>>();

    if (updateError) {
      setError(updateError.message || "Errore salvataggio note interne.");
      setSavingNote(false);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      setError("Salvataggio non consentito o lead non trovato.");
      setSavingNote(false);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const actorProfileId = authData.user?.id ?? null;

    if (currentDealerId) {
      await writeLeadActivity(supabase, {
        dealerId: currentDealerId,
        leadId: lead.id,
        activityType: "note_added",
        note: note.trim() ? "Note interne aggiornate." : "Note interne svuotate.",
        actorProfileId,
      });
    }

    const refreshedTimeline = currentDealerId
      ? await listLeadActivities(supabase, currentDealerId, lead.id, lead.created_at)
      : activities;

    setLead((prev) => (prev ? { ...prev, internal_notes: note } : prev));
    setActivities(refreshedTimeline);
    setSavingNote(false);
  };

  const handleCreateAppointment = async () => {
    if (!currentDealerId || !lead) {
      setError("Concessionaria non associata all'utente.");
      return;
    }

    const startAtIso = toIsoFromLocalDateTime(appointmentAt);
    if (!startAtIso) {
      setError("Inserisci data e ora appuntamento valide.");
      return;
    }

    setSavingAppointment(true);
    setError(null);
    setActionMessage(null);

    const vehicleId = linkVehicleToAppointment ? lead.vehicle?.id ?? null : null;
    const title = `Appuntamento lead ${fullName}`;

    try {
      const { data: insertedRows, error: insertError } = await supabase
        .from("appointments")
        .insert({
          dealer_id: currentDealerId,
          lead_id: lead.id,
          vehicle_id: vehicleId,
          title,
          status: mapAppointmentStatusToDb(appointmentStatus),
          start_at: startAtIso,
          appointment_date: startAtIso,
          notes: appointmentNotes || null,
          description: appointmentNotes || null,
        })
        .select("id")
        .returns<Array<{ id: string }>>();

      if (insertError || !insertedRows || insertedRows.length === 0) {
        setError(insertError?.message || "Errore creazione appuntamento.");
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const actorProfileId = authData.user?.id ?? null;

      await writeLeadActivity(supabase, {
        dealerId: currentDealerId,
        leadId: lead.id,
        activityType: "status_changed",
        note: `Appuntamento ${appointmentStatusLabel(appointmentStatus).toLowerCase()} creato per ${formatDate(startAtIso)}.`,
        actorProfileId,
        metadata: {
          appointmentId: insertedRows[0].id,
          status: appointmentStatus,
          startAt: startAtIso,
        },
      });

      const [refreshedTimeline, refreshedAppointments] = await Promise.all([
        listLeadActivities(supabase, currentDealerId, lead.id, lead.created_at),
        loadLeadAppointments(currentDealerId, lead.id),
      ]);

      setActivities(refreshedTimeline);
      setAppointments(refreshedAppointments);
      setAppointmentAt("");
      setAppointmentNotes("");
      setAppointmentStatus("programmato");
    } catch {
      setError("Errore imprevisto durante la creazione appuntamento.");
    } finally {
      setSavingAppointment(false);
    }
  };

  const handleCopyClientPortalLink = async () => {
    if (!lead?.id) {
      setError("Lead non disponibile.");
      return;
    }

    setGeneratingPortalLink(true);
    setError(null);
    setActionMessage(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;

      if (!accessToken) {
        setError("Sessione non valida.");
        return;
      }

      const response = await fetch("/api/client-portal/link", {
        method: "POST",
        headers: buildActiveDealerHeaders({
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ leadId: lead.id }),
      });

      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) {
        setError(payload?.error || "Impossibile generare il link del portale cliente.");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.url);
      }

      setActionMessage("Link portale cliente copiato negli appunti.");
    } catch {
      setError("Errore durante la generazione del link portale cliente.");
    } finally {
      setGeneratingPortalLink(false);
    }
  };

  const fullName =
    `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() ||
    "Cliente";

  const hasPhone = String(lead.phone ?? "").trim().length > 0;
  const hasEmail = String(lead.email ?? "").includes("@");
  const whatsappPhone = hasPhone ? cleanPhone(String(lead.phone ?? "")) : "";
  const hasWhatsappPhone = whatsappPhone.length >= 6;

  const vehicleLabel = [
    lead.vehicle?.brand,
    lead.vehicle?.model,
    lead.vehicle?.version,
    lead.vehicle?.year,
  ]
    .filter(Boolean)
    .join(" ");
  const vehicleLabelSafe = vehicleLabel || "Veicolo non collegato";

  return (
    <DealerDashboardShell title="Dettaglio Lead" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={0}>
      {error ? <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</section> : null}
      {actionMessage ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{actionMessage}</section> : null}

      <div className="mx-auto max-w-7xl space-y-6">

        <div className="rounded-[32px] bg-slate-950 p-8 text-white shadow-xl">

          <p className="text-xs uppercase tracking-[0.35em] text-blue-300">
            CRM LEAD
          </p>

          <h1 className="mt-4 text-4xl font-bold">
            {fullName}
          </h1>

          <p className="mt-3 text-slate-300">
            {vehicleLabelSafe}
          </p>

        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">

          <section className="space-y-6">

            <Card title="Dati Cliente">

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
              {activities.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                  Nessuna attività disponibile per questo lead.
                </p>
              ) : (
                activities.map((activity) => (
                  <TimelineItem
                    key={activity.id}
                    title={activity.title}
                    text={`${activity.description} (${formatDate(activity.createdAt)})`}
                  />
                ))
              )}

            </Card>

            <Card title="Appuntamenti lead">
              <div className="grid gap-3">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Data e ora</span>
                  <input
                    type="datetime-local"
                    value={appointmentAt}
                    onChange={(event) => setAppointmentAt(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-300"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Stato appuntamento</span>
                  <select
                    value={appointmentStatus}
                    onChange={(event) => setAppointmentStatus(event.target.value as AppointmentStatus)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-300"
                  >
                    <option value="programmato">Programmato</option>
                    <option value="completato">Completato</option>
                    <option value="annullato">Annullato</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Note appuntamento</span>
                  <textarea
                    value={appointmentNotes}
                    onChange={(event) => setAppointmentNotes(event.target.value)}
                    placeholder="Note interne appuntamento"
                    className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={linkVehicleToAppointment}
                    onChange={(event) => setLinkVehicleToAppointment(event.target.checked)}
                    disabled={!lead.vehicle?.id}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  Collega veicolo al nuovo appuntamento
                </label>

                <button
                  type="button"
                  onClick={() => {
                    void handleCreateAppointment();
                  }}
                  disabled={savingAppointment || !appointmentAt}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingAppointment ? "Creazione..." : "Crea appuntamento"}
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {appointments.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                    Nessun appuntamento collegato a questo lead.
                  </p>
                ) : (
                  appointments.map((appointment) => (
                    <div key={appointment.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{appointment.title}</p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${appointmentStatusBadgeClass(appointment.status)}`}>
                          {appointmentStatusLabel(appointment.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(appointment.startAt)}</p>
                      {appointment.notes ? <p className="mt-2 text-sm text-slate-700">{appointment.notes}</p> : null}
                      <p className="mt-1 text-xs text-slate-500">
                        {appointment.vehicleId ? "Veicolo collegato" : "Senza veicolo collegato"}
                      </p>
                    </div>
                  ))
                )}
              </div>
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

              <div className="flex items-center justify-between gap-2">
                <p className="mt-3 text-xs text-slate-500">Le note sono visibili solo al team interno concessionaria.</p>
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveNote();
                  }}
                  disabled={savingNote}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingNote ? "Salvataggio..." : "Salva note"}
                </button>
              </div>

            </Card>

          </section>
                    <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">

            <Card title="Stato commerciale">
              <div className="space-y-3">
                <span className="inline-flex rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
                  {formatStatus(lead.status)}
                </span>
                <select
                  value={normalizeLeadStage(lead.status)}
                  onChange={(event) => {
                    void handleStageChange(event.target.value as LeadStage);
                  }}
                  disabled={savingStage}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {leadStages.map((stage) => (
                    <option key={stage} value={stage}>
                      {leadStageLabels[stage]}
                    </option>
                  ))}
                </select>
              </div>
            </Card>

            {lead.vehicle?.id ? (
              <Card title="Veicolo collegato">
                <p className="text-sm text-slate-700">{vehicleLabel || "Veicolo non disponibile"}</p>
                <Link
                  href={`/veicoli/${lead.vehicle.id}`}
                  className="inline-flex rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700"
                >
                  Apri scheda veicolo
                </Link>
              </Card>
            ) : null}

            <Card title="Azioni rapide">
              <div className="grid gap-3">

                {hasPhone ? (
                  <>
                    <a
                      href={`tel:${String(lead.phone ?? "").trim()}`}
                      className="rounded-3xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white"
                    >
                      Chiama cliente
                    </a>

                    {hasWhatsappPhone ? (
                      <a
                        href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(
                          `Buongiorno ${lead.first_name ?? ""}, la contatto per la richiesta su ${vehicleLabelSafe}.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-3xl bg-green-600 px-5 py-3 text-center text-sm font-semibold text-white"
                      >
                        Scrivi WhatsApp
                      </a>
                    ) : null}
                  </>
                ) : null}

                {hasEmail ? (
                  <a
                    href={`mailto:${lead.email}?subject=${encodeURIComponent(
                      `Richiesta informazioni ${vehicleLabelSafe}`
                    )}`}
                    className="rounded-3xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white"
                  >
                    Invia email
                  </a>
                ) : null}

                <Link
                  href="/appuntamenti"
                  className="inline-flex rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700"
                >
                  Gestisci in sezione Appuntamenti
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    void handleCopyClientPortalLink();
                  }}
                  disabled={generatingPortalLink}
                  className="rounded-3xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generatingPortalLink ? "Generazione link..." : "Copia link portale cliente"}
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
    </DealerDashboardShell>
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

  const stage = normalizeLeadStage(value);
  return leadStageLabels[stage];
}

function cleanPhone(phone: string) {
  return phone.replace(/\D/g, "");
}