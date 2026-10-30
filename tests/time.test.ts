import { describe, expect, it } from "vitest";
import { parseLocalDateTime } from "@/lib/time";

describe("parseLocalDateTime", () => {
  it("reads booking form times as community wall time, not server time", () => {
    expect(parseLocalDateTime("2026-11-02T10:00", "Australia/Darwin").toISOString()).toBe("2026-11-02T00:30:00.000Z");
  });

  it("handles zones with daylight saving", () => {
    // Sydney is UTC+11 in November.
    expect(parseLocalDateTime("2026-11-02T10:00", "Australia/Sydney").toISOString()).toBe("2026-11-01T23:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(Number.isNaN(parseLocalDateTime("next tuesday").getTime())).toBe(true);
  });
});
