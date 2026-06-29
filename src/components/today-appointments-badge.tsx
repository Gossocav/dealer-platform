"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Appointment = {
  id: string;
  start_at: string | null;
};

export function TodayAppointmentsBadge() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const count = useMemo(() => {
    const today = dayKey(new Date());
    return appointments.filter((item) => dayKeyFromIso(item.start_at) === today).length;
  }, [appointments]);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_at")
        .gte("start_at", startOfTodayIso())
        .lt("start_at", endOfTodayIso());

      if (error) return;
      setAppointments((data ?? []) as Appointment[]);
    };

    void load();

    const channel = supabase
      .channel("today-appointments-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        void load();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  if (count <= 0) {
    return null;
  }

  return (
    <span
      className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white"
      aria-label={`Appuntamenti di oggi: ${count > 99 ? "99+" : count}`}
      title="Appuntamenti di oggi"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dayKeyFromIso(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dayKey(date);
}

function startOfTodayIso() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return start.toISOString();
}

function endOfTodayIso() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return end.toISOString();
}
