import { Activity, Car, Percent, Target, TrendingUp, Users } from "lucide-react";
import { LeadStatusChart } from "@/components/dashboard/lead-status-chart";
import { LeadTrendChart } from "@/components/dashboard/lead-trend-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { NotificationCard } from "@/components/dashboard/notification-card";
import { DealerDashboardShell } from "@/components/layout/dealer-dashboard-shell";
import { PanelCard } from "@/components/ui/panel-card";
import {
  activityMock,
  dealerProfileMock,
  latestLeadsMock,
  latestVehiclesMock,
  leadStatusMock,
  leadTrendMock,
  metricsMock,
  notificationCardsMock,
  remindersMock,
} from "@/lib/mock/dashboard";

const metricIcons = [Car, Users, TrendingUp, Percent] as const;

export default function DashboardPage() {
  return (
    <DealerDashboardShell
      title="Dashboard Concessionario"
      dealerName={dealerProfileMock.name}
      avatarInitials={dealerProfileMock.avatarInitials}
      unreadNotifications={3}
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricsMock.map((metric, index) => (
          <MetricCard
            key={metric.id}
            label={metric.label}
            value={metric.value}
            delta={metric.delta}
            tone={metric.tone}
            icon={metricIcons[index]}
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {notificationCardsMock.map((card) => (
          <NotificationCard key={card.id} title={card.title} subtitle={card.subtitle} colorClass={card.colorClass} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <PanelCard title="Andamento lead" subtitle="Ultimi 30 giorni" className="xl:col-span-3">
          <LeadTrendChart points={leadTrendMock} />
        </PanelCard>

        <PanelCard title="Stato lead" subtitle="Distribuzione funnel" className="xl:col-span-2">
          <LeadStatusChart points={leadStatusMock} />
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <PanelCard title="Ultimi lead" subtitle="Aggiornati in tempo reale lato operatore">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-slate-500">Cliente</th>
                  <th className="px-3 py-2 text-slate-500">Veicolo</th>
                  <th className="px-3 py-2 text-slate-500">Stato</th>
                  <th className="px-3 py-2 text-slate-500">Data</th>
                </tr>
              </thead>
              <tbody>
                {latestLeadsMock.map((lead) => (
                  <tr key={lead.id} className="rounded-2xl bg-slate-50 text-slate-700">
                    <td className="rounded-l-2xl px-3 py-3 font-semibold text-slate-900">{lead.customer}</td>
                    <td className="px-3 py-3">{lead.vehicle}</td>
                    <td className="px-3 py-3">{lead.status}</td>
                    <td className="rounded-r-2xl px-3 py-3">{lead.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>

        <PanelCard title="Ultimi veicoli inseriti" subtitle="Stato inventario corrente">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-slate-500">Modello</th>
                  <th className="px-3 py-2 text-slate-500">Prezzo</th>
                  <th className="px-3 py-2 text-slate-500">Stato</th>
                  <th className="px-3 py-2 text-slate-500">Inserito</th>
                </tr>
              </thead>
              <tbody>
                {latestVehiclesMock.map((vehicle) => (
                  <tr key={vehicle.id} className="rounded-2xl bg-slate-50 text-slate-700">
                    <td className="rounded-l-2xl px-3 py-3 font-semibold text-slate-900">{vehicle.model}</td>
                    <td className="px-3 py-3">{vehicle.price}</td>
                    <td className="px-3 py-3">{vehicle.state}</td>
                    <td className="rounded-r-2xl px-3 py-3">{vehicle.insertedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <PanelCard title="Attivita recenti" subtitle="Azioni operative del team" action={<Activity className="h-4 w-4 text-slate-500" />}>
          <ul className="space-y-3">
            {activityMock.map((item) => (
              <li key={item.id} className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">{item.timestamp}</p>
              </li>
            ))}
          </ul>
        </PanelCard>

        <PanelCard title="Promemoria" subtitle="Follow-up e scadenze" action={<Target className="h-4 w-4 text-slate-500" />}>
          <ul className="space-y-3">
            {remindersMock.map((item) => (
              <li key={item.id} className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">Scadenza: {item.due}</p>
              </li>
            ))}
          </ul>
        </PanelCard>
      </section>
    </DealerDashboardShell>
  );
}
