export const APP_TZ = process.env.APP_TIMEZONE ?? "Australia/Darwin";

/** Offset in ms of `timeZone` from UTC at instant `at`. */
function tzOffset(at: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at;
}

/** Parses a `datetime-local` value ("2026-11-02T10:00") as wall time in the app time zone. */
export function parseLocalDateTime(value: string, timeZone = APP_TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return new Date(NaN);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const first = wall - tzOffset(wall, timeZone);
  return new Date(wall - tzOffset(first, timeZone));
}

export const formatWhen = (d: Date) =>
  d.toLocaleString("en-AU", { timeZone: APP_TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
