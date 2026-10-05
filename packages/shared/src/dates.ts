/** Fechas de calendario como "AAAA-MM-DD", en horario de Argentina. */
export type DateStr = string;

export const TZ = "America/Argentina/Buenos_Aires";

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toDateStr(d: Date): DateStr {
  return ymd.format(d);
}

export function todayAR(now: Date = new Date()): DateStr {
  return toDateStr(now);
}

function parse(d: DateStr): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1);
}

export function addDays(d: DateStr, days: number): DateStr {
  return new Date(parse(d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export function diffDays(from: DateStr, to: DateStr): number {
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** 0 = domingo … 6 = sábado. */
export function weekday(d: DateStr): number {
  return new Date(parse(d)).getUTCDay();
}

/** dd/mm/aaaa */
export function formatDate(d: DateStr | Date): string {
  const s = typeof d === "string" ? d : toDateStr(d);
  const [y, m, day] = s.split("-");
  return `${day}/${m}/${y}`;
}

const hm = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Hora de 24 h: 18:40 */
export function formatTime(d: Date): string {
  return hm.format(d);
}

/** Un instante a partir de una fecha y hora de Argentina (UTC−3, sin horario de verano). */
export function arDateTime(date: DateStr, time = "00:00"): Date {
  return new Date(`${date}T${time}:00-03:00`);
}
