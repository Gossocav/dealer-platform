export type AppointmentStatus = "programmato" | "completato" | "annullato";

export type LeadAppointmentItem = {
  id: string;
  title: string;
  startAt: string | null;
  status: AppointmentStatus;
  notes: string;
  vehicleId: string | null;
};

export function normalizeAppointmentStatus(value: string | null | undefined): AppointmentStatus {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "completato" || normalized === "completed" || normalized === "concluso") {
    return "completato";
  }

  if (normalized === "annullato" || normalized === "cancelled") {
    return "annullato";
  }

  if (normalized === "programmato" || normalized === "scheduled" || normalized === "confirmed" || normalized === "confermato") {
    return "programmato";
  }

  return "programmato";
}

export function mapAppointmentStatusToDb(status: AppointmentStatus): string {
  if (status === "completato") return "completato";
  if (status === "annullato") return "annullato";
  return "programmato";
}

export function appointmentStatusLabel(status: AppointmentStatus): string {
  if (status === "completato") return "Completato";
  if (status === "annullato") return "Annullato";
  return "Programmato";
}

export function appointmentStatusBadgeClass(status: AppointmentStatus): string {
  if (status === "completato") return "bg-emerald-100 text-emerald-700";
  if (status === "annullato") return "bg-rose-100 text-rose-700";
  return "bg-sky-100 text-sky-700";
}

export function toIsoFromLocalDateTime(value: string): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}
