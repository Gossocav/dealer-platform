export type MetricData = {
  id: string;
  label: string;
  value: string;
  delta: string;
  tone: "positive" | "neutral";
};

export type SeriesPoint = {
  label: string;
  value: number;
};

export type LeadStatusPoint = {
  label: string;
  value: number;
  colorClass: string;
};

export type LeadListItem = {
  id: string;
  customer: string;
  vehicle: string;
  status: string;
  date: string;
};

export type VehicleListItem = {
  id: string;
  model: string;
  price: string;
  state: string;
  insertedAt: string;
};

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
};

export type ReminderItem = {
  id: string;
  title: string;
  detail: string;
  due: string;
};

export type NotificationCardData = {
  id: string;
  title: string;
  subtitle: string;
  colorClass: string;
};

export const dealerProfileMock = {
  name: "Gossocar Premium Motors",
  avatarInitials: "GP",
};

export const metricsMock: MetricData[] = [
  { id: "vehicles", label: "Veicoli pubblicati", value: "128", delta: "+8% mese", tone: "positive" },
  { id: "leads", label: "Lead ricevuti", value: "342", delta: "+12% mese", tone: "positive" },
  { id: "sold", label: "Auto vendute", value: "47", delta: "+5% mese", tone: "positive" },
  { id: "conversion", label: "Conversione %", value: "13.7%", delta: "Stabile", tone: "neutral" },
];

export const leadTrendMock: SeriesPoint[] = [
  { label: "01", value: 4 },
  { label: "04", value: 7 },
  { label: "07", value: 5 },
  { label: "10", value: 9 },
  { label: "13", value: 11 },
  { label: "16", value: 8 },
  { label: "19", value: 12 },
  { label: "22", value: 10 },
  { label: "25", value: 7 },
  { label: "28", value: 9 },
  { label: "30", value: 6 },
];

export const leadStatusMock: LeadStatusPoint[] = [
  { label: "Nuovo", value: 46, colorClass: "bg-sky-500" },
  { label: "Contattato", value: 28, colorClass: "bg-emerald-500" },
  { label: "Appuntamento", value: 18, colorClass: "bg-amber-500" },
  { label: "Chiuso", value: 8, colorClass: "bg-slate-700" },
];

export const latestLeadsMock: LeadListItem[] = [
  { id: "l1", customer: "Marco R.", vehicle: "Audi A4 Avant", status: "Nuovo", date: "Oggi 10:14" },
  { id: "l2", customer: "Giulia P.", vehicle: "BMW X1", status: "Contattato", date: "Oggi 09:42" },
  { id: "l3", customer: "Luca M.", vehicle: "Mercedes GLA", status: "Appuntamento", date: "Ieri 18:03" },
  { id: "l4", customer: "Alessio V.", vehicle: "Toyota C-HR", status: "Nuovo", date: "Ieri 16:17" },
  { id: "l5", customer: "Sara D.", vehicle: "Volkswagen Golf", status: "Contattato", date: "Ieri 14:28" },
];

export const latestVehiclesMock: VehicleListItem[] = [
  { id: "v1", model: "BMW Serie 3 320d", price: "EUR 34.900", state: "Pubblicato", insertedAt: "Oggi" },
  { id: "v2", model: "Audi Q3 35 TDI", price: "EUR 29.800", state: "In revisione", insertedAt: "Oggi" },
  { id: "v3", model: "Mini Countryman", price: "EUR 24.500", state: "Pubblicato", insertedAt: "Ieri" },
  { id: "v4", model: "Ford Kuga ST-Line", price: "EUR 22.900", state: "Bozza", insertedAt: "Ieri" },
  { id: "v5", model: "Jeep Compass", price: "EUR 26.300", state: "Pubblicato", insertedAt: "2 giorni fa" },
];

export const activityMock: ActivityItem[] = [
  { id: "a1", title: "Lead assegnato a consulente", detail: "Marco R. su Audi A4 Avant", timestamp: "10 min fa" },
  { id: "a2", title: "Scheda veicolo aggiornata", detail: "BMW Serie 3 320d", timestamp: "38 min fa" },
  { id: "a3", title: "Appuntamento confermato", detail: "Test drive Mercedes GLA", timestamp: "1h fa" },
  { id: "a4", title: "Nuovo cliente registrato", detail: "Profilo Giulia P.", timestamp: "2h fa" },
];

export const remindersMock: ReminderItem[] = [
  { id: "r1", title: "Richiamare lead caldo", detail: "Luca M. interessato a Mercedes GLA", due: "Oggi 15:30" },
  { id: "r2", title: "Aggiornare prezzi stock", detail: "3 veicoli SUV in promozione", due: "Domani" },
  { id: "r3", title: "Follow-up post test drive", detail: "Cliente Toyota C-HR", due: "Domani 11:00" },
];

export const notificationCardsMock: NotificationCardData[] = [
  {
    id: "n1",
    title: "Hai 3 nuovi lead",
    subtitle: "Priorita alta nelle ultime 2 ore",
    colorClass: "from-sky-100 to-white text-sky-800",
  },
  {
    id: "n2",
    title: "2 veicoli in scadenza",
    subtitle: "Rinnova le pubblicazioni entro 48h",
    colorClass: "from-amber-100 to-white text-amber-800",
  },
  {
    id: "n3",
    title: "Abbonamento attivo",
    subtitle: "Piano Professional, rinnovo il 28/07",
    colorClass: "from-emerald-100 to-white text-emerald-800",
  },
];