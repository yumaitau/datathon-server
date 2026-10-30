import { describe, expect, it } from "vitest";
import { localPhone, reminderText } from "@/lib/health";

// 2026-11-02 10:00 in Darwin (UTC+9:30) is 00:30Z.
const appt = new Date("2026-11-02T00:30:00.000Z");
const dayBefore = new Date("2026-11-01T02:00:00.000Z");

describe("reminder copy", () => {
  it("says when, but never what, because phones are shared", () => {
    const text = reminderText(appt, "self", { now: dayBefore });
    expect(text).toBe("You have an appointment tomorrow at 10am. Open MyMob for details.");
  });

  it("addresses carers without naming the person", () => {
    expect(reminderText(appt, "carer", { now: dayBefore })).toMatch(/^Someone you care for has an appointment tomorrow at 10am\./);
  });

  it("gives people without the app the clinic number instead of the app", () => {
    const text = reminderText(appt, "self", { now: dayBefore, clinicPhone: "+61889000001" });
    expect(text).toBe("You have an appointment tomorrow at 10am. Call 08 8900 0001 for details.");
  });

  it("uses today for same-day reminders", () => {
    expect(reminderText(appt, "self", { now: new Date("2026-11-01T22:30:00.000Z") })).toContain("today at 10am");
  });
});

describe("localPhone", () => {
  it("formats Australian landlines and mobiles", () => {
    expect(localPhone("+61889000001")).toBe("08 8900 0001");
    expect(localPhone("+61400000006")).toBe("04 0000 0006");
  });
});
