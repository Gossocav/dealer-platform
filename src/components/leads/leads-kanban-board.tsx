import Link from "next/link";
import { Mail, PhoneCall } from "lucide-react";
import {
  formatLeadDate,
  leadPriorityLabels,
  leadStageLabels,
  leadStages,
  type LeadItem,
  type LeadPriority,
  type LeadStage,
} from "@/lib/leads";

type LeadsKanbanBoardProps = {
  items: LeadItem[];
  onStageChange: (leadId: string, nextStage: LeadStage) => Promise<void>;
  pendingLeadId: string | null;
};

const stageDescriptions: Record<LeadStage, string> = {
  nuovo: "Nuovo",
  contattato: "Contattato",
  appuntamento: "Appuntamento fissato",
  proposta_inviata: "Proposta commerciale inviata",
  chiuso_positivo: "Opportunita chiusa positivamente",
  chiuso_negativo: "Opportunita chiusa negativamente",
};

function priorityClasses(priority: LeadPriority): string {
  if (priority === "alta") return "bg-rose-100 text-rose-700";
  if (priority === "media") return "bg-amber-100 text-amber-700";
  return "bg-slate-200 text-slate-700";
}

export function LeadsKanbanBoard({ items, onStageChange, pendingLeadId }: LeadsKanbanBoardProps) {
  const grouped = leadStages.map((stage) => ({
    stage,
    leads: items.filter((lead) => lead.stage === stage),
  }));

  return (
    <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {grouped.map((column) => (
        <article
          key={column.stage}
          className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-4 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">{leadStageLabels[column.stage]}</h3>
              <p className="text-xs text-slate-500">{stageDescriptions[column.stage]}</p>
            </div>
            <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
              {column.leads.length}
            </span>
          </div>

          <div className="space-y-3">
            {column.leads.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Nessun lead in questa colonna.
              </p>
            ) : (
              column.leads.map((lead) => (
                <div
                  key={lead.id}
                  className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-22px_rgba(15,23,42,0.45)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{lead.customerName}</p>
                      <p className="text-xs text-slate-500">{lead.email}</p>
                      <p className="text-xs text-slate-500">{lead.phone}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityClasses(lead.priority)}`}>
                      {leadPriorityLabels[lead.priority]}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-medium text-slate-700">{lead.vehicle}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{lead.message}</p>

                  <label className="mt-3 block">
                    <span className="text-xs uppercase tracking-[0.14em] text-slate-400">Stato</span>
                    <select
                      value={lead.stage}
                      onChange={(event) => {
                        const nextStage = event.target.value as LeadStage;
                        void onStageChange(lead.id, nextStage);
                      }}
                      disabled={pendingLeadId === lead.id}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {leadStages.map((stage) => (
                        <option key={stage} value={stage}>
                          {leadStageLabels[stage]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-400">Richiesta: {formatLeadDate(lead.requestDate)}</p>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold">
                    <a
                      href={`tel:${lead.phone.replace(/\s+/g, "")}`}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700 transition hover:bg-slate-100"
                    >
                      <PhoneCall className="h-3.5 w-3.5" /> Chiama
                    </a>
                    <a
                      href={`mailto:${lead.email}`}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700 transition hover:bg-slate-100"
                    >
                      <Mail className="h-3.5 w-3.5" /> Email
                    </a>
                    <Link
                      href={`/lead/${lead.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700 transition hover:bg-slate-100"
                    >
                      Dettagli
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
