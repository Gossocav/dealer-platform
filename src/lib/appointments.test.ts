import { describe, expect, it } from "vitest";
import { mapAppointmentStatusToDb, normalizeAppointmentStatus, toIsoFromLocalDateTime } from "@/lib/appointments";

describe("appointments helpers", () => {
  it("normalizes legacy appointment statuses", () => {
    expect(normalizeAppointmentStatus("scheduled")).toBe("programmato");
    expect(normalizeAppointmentStatus("confirmed")).toBe("programmato");
    expect(normalizeAppointmentStatus("confermato")).toBe("programmato");
    expect(normalizeAppointmentStatus("completed")).toBe("completato");
    expect(normalizeAppointmentStatus("concluso")).toBe("completato");
    expect(normalizeAppointmentStatus("cancelled")).toBe("annullato");
  });

  it("maps UI statuses to db value", () => {
    expect(mapAppointmentStatusToDb("programmato")).toBe("programmato");
    expect(mapAppointmentStatusToDb("completato")).toBe("completato");
    expect(mapAppointmentStatusToDb("annullato")).toBe("annullato");
  });

  it("returns null for invalid local datetime", () => {
    expect(toIsoFromLocalDateTime("bad-date")).toBeNull();
  });
});
