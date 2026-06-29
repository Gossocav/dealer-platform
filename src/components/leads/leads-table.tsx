import Link from "next/link";
import { Mail, PhoneCall } from "lucide-react";
import {
  formatLeadDate,
  leadPriorityLabels,
  leadStageLabels,
  type LeadItem,
  type LeadPriority,
  type LeadStage,
} from "@/lib/mock/leads";

type LeadsTableProps = {
  items: LeadItem[];
};

function priorityClasses(priority: LeadPriority): string {
  if (priority === "alta") return "bg-rose-100 text-rose-700";
  if (priority === "media") return "bg-amber-100 text-amber-700";
  return "bg-slate-200 text-slate-700";
}

function stageClasses(stage: LeadStage): string {
  if (stage === "new") return "bg-blue-100 text-blue-700";
  if (stage === "contacted") return "bg-sky-100 text-sky-700";
  if (stage === "quote") return "bg-violet-100 text-violet-700";
  if (stage === "negotiation") return "bg-amber-100 text-amber-700";
  if (stage === "won") return "bg-emerald-100 text-emerald-700";
  return "bg-rose-100 text-rose-700";
}

export function LeadsTable({ items }: LeadsTableProps) {
  return (
    <section className="dashboard-fade-up rounded-3xl border border-slate-200/70 bg-white p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6">
      <div className="overflow-x-auto">
        <table className="min-w-[980px] border-separate border-spacing-y-2 text-left text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2 text-slate-500">Cliente</th>
              <th className="px-3 py-2 text-slate-500">Contatti</th>
              <th className="px-3 py-2 text-slate-500">Veicolo</th>
              <th className="px-3 py-2 text-slate-500">Messaggio</th>
              <th className="px-3 py-2 text-slate-500">Sorgente</th>
              <th className="px-3 py-2 text-slate-500">Priorita</th>
              <th className="px-3 py-2 text-slate-500">Stato</th>
              <th className="px-3 py-2 text-slate-500">Data richiesta</th>
              <th className="px-3 py-2 text-slate-500">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-slate-500">
                  Nessun lead corrisponde ai filtri selezionati.
                </td>
              </tr>
            ) : (
              items.map((lead) => (
                <tr key={lead.id} className="rounded-2xl bg-slate-50 text-slate-700">
                  <td className="rounded-l-2xl px-3 py-3 font-semibold text-slate-900">{lead.customerName}</td>
                  <td className="px-3 py-3">
                    <p>{lead.email}</p>
                    <p>{lead.phone}</p>
                  </td>
                  <td className="px-3 py-3">{lead.vehicle}</td>
                  <td className="px-3 py-3">{lead.message}</td>
                  <td className="px-3 py-3">{lead.source}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityClasses(lead.priority)}`}>
                      {leadPriorityLabels[lead.priority]}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stageClasses(lead.stage)}`}>
                      {leadStageLabels[lead.stage]}
                    </span>
                  </td>
                  <td className="px-3 py-3">{formatLeadDate(lead.requestDate)}</td>
                  <td className="rounded-r-2xl px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`tel:${lead.phone.replace(/\s+/g, "")}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
                        aria-label={`Chiama ${lead.customerName}`}
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={`mailto:${lead.email}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
                        aria-label={`Email a ${lead.customerName}`}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                      <Link
                        href={`/lead/${lead.id}`}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Dettagli
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
