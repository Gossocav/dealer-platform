"use client";

import { useEffect, useMemo, useState } from "react";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { getActiveDealerId } from "@/lib/active-tenant";
import { resolveDealerIdFromTenantSources } from "@/lib/dealer-id-resolution";
import { getDemoFeatureBlockReason, resolveDemoAccessContext } from "@/lib/demo-access";
import { supabase } from "@/lib/supabaseClient";

type Person = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type Vehicle = {
  id: string;
  brand: string | null;
  model: string | null;
};

type EmailThreadRow = {
  id: string;
  lead_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  last_message_at: string | null;
  created_at: string;
  lead?: Person | Person[] | null;
  customer?: Person | Person[] | null;
  vehicle?: Vehicle | Vehicle[] | null;
};

type EmailThread = {
  id: string;
  leadId: string | null;
  customerId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  lead: Person | null;
  customer: Person | null;
  vehicle: Vehicle | null;
};

type EmailMessage = {
  id: string;
  thread_id: string;
  direction: "outbound" | "inbound" | string;
  status: string;
  subject: string;
  to_recipients: unknown;
  body_text: string | null;
  body_html: string | null;
  created_at: string;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
};

type PickerOption = {
  id: string;
  label: string;
  email: string;
};

function normalizeEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function formatPersonName(person: Person | null) {
  if (!person) return null;
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : person.email;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function extractRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function threadSubjectFallback(thread: EmailThread) {
  return formatPersonName(thread.customer) ?? formatPersonName(thread.lead) ?? "Nuova conversazione";
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  sent: "Inviata",
  failed: "Fallita",
  queued: "In coda",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-slate-200 text-slate-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  queued: "bg-amber-100 text-amber-700",
};

export default function EmailPage() {
  const [dealerId, setDealerId] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [demoBlockMessage, setDemoBlockMessage] = useState<string | null>(null);

  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [leadOptions, setLeadOptions] = useState<PickerOption[]>([]);
  const [customerOptions, setCustomerOptions] = useState<PickerOption[]>([]);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composingNew, setComposingNew] = useState(false);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [recipientPickerId, setRecipientPickerId] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    let active = true;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active || !user?.id) {
        if (active) setLoading(false);
        return;
      }

      const resolvedDealerId = await resolveDealerIdFromTenantSources(supabase, user.id, {
        activeDealerId: getActiveDealerId(),
      });

      if (!active) return;

      if (!resolvedDealerId) {
        setLoading(false);
        return;
      }

      setDealerId(resolvedDealerId);

      const demoContext = await resolveDemoAccessContext(supabase, resolvedDealerId);
      if (!active) return;

      if (demoContext.isDemo) {
        setIsDemo(true);
        setDemoBlockMessage(getDemoFeatureBlockReason(demoContext, "email")?.message ?? null);
      }
    };

    void init();

    return () => {
      active = false;
    };
  }, []);

  const fetchThreads = async () => {
    const result = await supabase
      .from("email_threads")
      .select(
        "id, lead_id, customer_id, vehicle_id, last_message_at, created_at, lead:leads(id, first_name, last_name, email), customer:customers(id, first_name, last_name, email), vehicle:vehicles(id, brand, model)"
      )
      .order("last_message_at", { ascending: false });

    if (result.error) {
      setStatusMessage({ type: "error", text: result.error.message || "Errore caricamento conversazioni." });
      return;
    }

    const rows = (result.data ?? []) as unknown as EmailThreadRow[];
    setThreads(
      rows.map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        customerId: row.customer_id,
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at,
        lead: normalizeEmbed(row.lead),
        customer: normalizeEmbed(row.customer),
        vehicle: normalizeEmbed(row.vehicle),
      }))
    );
  };

  const fetchMessages = async (threadId: string) => {
    const result = await supabase
      .from("email_messages")
      .select("id, thread_id, direction, status, subject, to_recipients, body_text, body_html, created_at, sent_at, failed_at, error_message")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (result.error) {
      setStatusMessage({ type: "error", text: result.error.message || "Errore caricamento messaggi." });
      return;
    }

    setMessages((result.data ?? []) as EmailMessage[]);
  };

  const fetchPickerOptions = async () => {
    const [leadsResult, customersResult] = await Promise.all([
      supabase.from("leads").select("id, first_name, last_name, email").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, first_name, last_name, email").order("created_at", { ascending: false }),
    ]);

    if (!leadsResult.error) {
      setLeadOptions(
        (leadsResult.data ?? [])
          .filter((row): row is Person => Boolean(row.email))
          .map((row) => ({ id: row.id, label: formatPersonName(row) ?? row.email ?? "-", email: row.email ?? "" }))
      );
    }

    if (!customersResult.error) {
      setCustomerOptions(
        (customersResult.data ?? [])
          .filter((row): row is Person => Boolean(row.email))
          .map((row) => ({ id: row.id, label: formatPersonName(row) ?? row.email ?? "-", email: row.email ?? "" }))
      );
    }
  };

  useEffect(() => {
    let active = true;

    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchThreads(), fetchPickerOptions()]);
      if (active) setLoading(false);
    };

    void loadAll();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("dealer-email-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "email_threads" }, () => void fetchThreads())
      .on("postgres_changes", { event: "*", schema: "public", table: "email_messages" }, () => {
        void fetchThreads();
        if (selectedThreadId) void fetchMessages(selectedThreadId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedThreadId]);

  const selectThread = (threadId: string) => {
    setComposingNew(false);
    setSelectedThreadId(threadId);
    setBody("");
    void fetchMessages(threadId);
  };

  const startNewThread = () => {
    setSelectedThreadId(null);
    setComposingNew(true);
    setMessages([]);
    setRecipientPickerId("");
    setManualEmail("");
    setSubject("");
    setBody("");
  };

  const selectedThread = useMemo(() => threads.find((t) => t.id === selectedThreadId) ?? null, [threads, selectedThreadId]);

  const replyRecipientEmail = useMemo(() => {
    if (!selectedThread) return null;
    if (selectedThread.customer?.email) return selectedThread.customer.email;
    if (selectedThread.lead?.email) return selectedThread.lead.email;
    const lastOutbound = [...messages].reverse().find((m) => m.direction === "outbound");
    return lastOutbound ? (extractRecipients(lastOutbound.to_recipients)[0] ?? null) : null;
  }, [selectedThread, messages]);

  const sendDraftMessage = async (messageId: string) => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setStatusMessage({ type: "error", text: "Sessione non valida. Effettua di nuovo il login." });
      return false;
    }

    const response = await fetch("/api/email/send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ messageId }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setStatusMessage({ type: "error", text: payload.error || "Invio email non riuscito." });
      return false;
    }

    return true;
  };

  const handleSendNew = async () => {
    if (isDemo) {
      setStatusMessage({ type: "error", text: demoBlockMessage ?? "Funzione non disponibile in demo." });
      return;
    }

    if (!dealerId) {
      setStatusMessage({ type: "error", text: "Concessionaria non risolta." });
      return;
    }

    const picked =
      leadOptions.find((o) => o.id === recipientPickerId) ?? customerOptions.find((o) => o.id === recipientPickerId) ?? null;
    const recipientEmail = (picked?.email ?? manualEmail).trim();

    if (!recipientEmail) {
      setStatusMessage({ type: "error", text: "Inserisci o seleziona un destinatario." });
      return;
    }

    if (!subject.trim() || !body.trim()) {
      setStatusMessage({ type: "error", text: "Compila oggetto e testo del messaggio." });
      return;
    }

    setSending(true);
    setStatusMessage(null);

    const isLead = leadOptions.some((o) => o.id === recipientPickerId);
    const isCustomer = customerOptions.some((o) => o.id === recipientPickerId);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const threadInsert = await supabase
      .from("email_threads")
      .insert({
        dealer_id: dealerId,
        lead_id: isLead ? recipientPickerId : null,
        customer_id: isCustomer ? recipientPickerId : null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (threadInsert.error || !threadInsert.data?.id) {
      setStatusMessage({ type: "error", text: threadInsert.error?.message || "Errore creazione conversazione." });
      setSending(false);
      return;
    }

    const threadId = threadInsert.data.id;

    const messageInsert = await supabase
      .from("email_messages")
      .insert({
        dealer_id: dealerId,
        thread_id: threadId,
        direction: "outbound",
        status: "draft",
        subject: subject.trim(),
        to_recipients: [recipientEmail],
        body_text: body.trim(),
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (messageInsert.error || !messageInsert.data?.id) {
      setStatusMessage({ type: "error", text: messageInsert.error?.message || "Errore creazione messaggio." });
      setSending(false);
      return;
    }

    const sent = await sendDraftMessage(messageInsert.data.id);
    setSending(false);

    if (sent) {
      setStatusMessage({ type: "success", text: "Email inviata." });
      setComposingNew(false);
      setSelectedThreadId(threadId);
      await fetchThreads();
      await fetchMessages(threadId);
    }
  };

  const handleReply = async () => {
    if (isDemo) {
      setStatusMessage({ type: "error", text: demoBlockMessage ?? "Funzione non disponibile in demo." });
      return;
    }

    if (!dealerId || !selectedThread) return;

    if (!replyRecipientEmail) {
      setStatusMessage({ type: "error", text: "Nessun destinatario noto per questa conversazione." });
      return;
    }

    if (!body.trim()) {
      setStatusMessage({ type: "error", text: "Scrivi un messaggio prima di inviare." });
      return;
    }

    setSending(true);
    setStatusMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const lastSubject = messages[messages.length - 1]?.subject ?? threadSubjectFallback(selectedThread);
    const replySubject = lastSubject.toLowerCase().startsWith("re:") ? lastSubject : `Re: ${lastSubject}`;

    const messageInsert = await supabase
      .from("email_messages")
      .insert({
        dealer_id: dealerId,
        thread_id: selectedThread.id,
        direction: "outbound",
        status: "draft",
        subject: replySubject,
        to_recipients: [replyRecipientEmail],
        body_text: body.trim(),
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (messageInsert.error || !messageInsert.data?.id) {
      setStatusMessage({ type: "error", text: messageInsert.error?.message || "Errore creazione messaggio." });
      setSending(false);
      return;
    }

    const sent = await sendDraftMessage(messageInsert.data.id);
    setSending(false);

    if (sent) {
      setStatusMessage({ type: "success", text: "Email inviata." });
      setBody("");
      await fetchThreads();
      await fetchMessages(selectedThread.id);
    }
  };

  return (
    <DealerDashboardShell title="Email" dealerName="Dealer Console" avatarInitials="DC" unreadNotifications={0}>
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <div className="px-4 py-6 lg:px-8">
          <div className="mb-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Email</p>
                <h1 className="mt-3 text-3xl font-semibold text-slate-900">Posta concessionaria</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  Scrivi e rispondi ai tuoi lead e clienti direttamente da qui.
                </p>
              </div>
              <button
                type="button"
                onClick={startNewThread}
                disabled={isDemo}
                className="inline-flex items-center justify-center rounded-3xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Nuovo messaggio
              </button>
            </div>
          </div>

          {isDemo ? (
            <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              {demoBlockMessage ?? "Funzione non disponibile nella demo."}
            </div>
          ) : null}

          {statusMessage ? (
            <div
              className={`mb-6 rounded-3xl border px-5 py-4 text-sm ${
                statusMessage.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {statusMessage.text}
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-slate-500">Conversazioni</p>

              {loading ? (
                <p className="text-sm text-slate-500">Caricamento...</p>
              ) : threads.length === 0 ? (
                <p className="text-sm text-slate-500">Nessuna conversazione ancora. Clicca &quot;Nuovo messaggio&quot; per iniziare.</p>
              ) : (
                <ul className="space-y-2">
                  {threads.map((thread) => (
                    <li key={thread.id}>
                      <button
                        type="button"
                        onClick={() => selectThread(thread.id)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          selectedThreadId === thread.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        <p className="text-sm font-semibold text-slate-900">{threadSubjectFallback(thread)}</p>
                        {thread.vehicle ? (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {[thread.vehicle.brand, thread.vehicle.model].filter(Boolean).join(" ")}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(thread.lastMessageAt ?? thread.createdAt)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              {composingNew ? (
                <div>
                  <p className="mb-4 text-sm font-semibold text-slate-500">Nuovo messaggio</p>

                  <label className="mb-1 block text-xs font-medium text-slate-600">Destinatario</label>
                  <select
                    value={recipientPickerId}
                    onChange={(event) => setRecipientPickerId(event.target.value)}
                    className="mb-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="">Inserisci email manualmente</option>
                    {leadOptions.length > 0 ? (
                      <optgroup label="Lead">
                        {leadOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {customerOptions.length > 0 ? (
                      <optgroup label="Clienti">
                        {customerOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>

                  {!recipientPickerId ? (
                    <input
                      type="email"
                      value={manualEmail}
                      onChange={(event) => setManualEmail(event.target.value)}
                      placeholder="email@esempio.it"
                      className="mb-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    />
                  ) : null}

                  <label className="mb-1 block text-xs font-medium text-slate-600">Oggetto</label>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="mb-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />

                  <label className="mb-1 block text-xs font-medium text-slate-600">Messaggio</label>
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    rows={8}
                    className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />

                  <button
                    type="button"
                    onClick={() => void handleSendNew()}
                    disabled={sending || isDemo}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? "Invio in corso..." : "Invia"}
                  </button>
                </div>
              ) : selectedThread ? (
                <div className="flex h-full flex-col">
                  <p className="mb-4 text-sm font-semibold text-slate-500">{threadSubjectFallback(selectedThread)}</p>

                  <div className="mb-4 max-h-[420px] space-y-3 overflow-y-auto">
                    {messages.map((message) => (
                      <div key={message.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{message.subject}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLASS[message.status] ?? "bg-slate-200 text-slate-700"}`}>
                            {STATUS_LABEL[message.status] ?? message.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {message.direction === "outbound" ? "A: " : "Da: "}
                          {extractRecipients(message.to_recipients).join(", ")} - {formatDateTime(message.created_at)}
                        </p>
                        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{message.body_text ?? message.body_html ?? ""}</p>
                        {message.status === "failed" && message.error_message ? (
                          <p className="mt-2 text-xs font-medium text-red-600">Errore: {message.error_message}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Rispondi a {replyRecipientEmail ?? "-"}</label>
                    <textarea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      rows={4}
                      className="mb-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => void handleReply()}
                      disabled={sending || isDemo || !replyRecipientEmail}
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sending ? "Invio in corso..." : "Invia risposta"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Seleziona una conversazione oppure inizia un nuovo messaggio.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </DealerDashboardShell>
  );
}
