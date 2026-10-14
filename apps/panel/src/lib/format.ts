// Mise en forme française, fuseau Europe/Paris.
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { formatPhone } from "@me/shared";
import type { Num } from "./types";

export const TZ = "Europe/Paris";

/** Date du jour à Paris au format yyyy-mm-dd. */
export function todayParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const d = parseISO(isoDate);
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

/** "2026-10-14" -> "mercredi 14 octobre 2026" (ou format personnalisé). */
export function formatDay(isoDate: string | null | undefined, pattern = "EEEE d MMMM yyyy"): string {
  if (!isoDate) return "—";
  return format(parseISO(isoDate), pattern, { locale: fr });
}

export function formatDayShort(isoDate: string | null | undefined): string {
  return formatDay(isoDate, "dd/MM/yyyy");
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });

/** Heure (Paris) d'un horodatage ISO : "07:05". */
export function formatTime(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  return timeFmt.format(typeof ts === "string" ? new Date(ts) : ts);
}

export function formatDateTime(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  return dateTimeFmt.format(typeof ts === "string" ? new Date(ts) : ts).replace(",", " à");
}

export function formatDate(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  return dateFmt.format(typeof ts === "string" ? new Date(ts) : ts);
}

/** Composants Paris d'un horodatage, pour pré-remplir un <input type="datetime-local">. */
export function toParisLocalInput(ts: string | null | undefined): string {
  if (!ts) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Inverse : "2026-10-14T07:05" saisi en heure de Paris -> ISO UTC. */
export function fromParisLocalInput(value: string): string | null {
  if (!value) return null;
  const [d, t] = value.split("T");
  const [y, mo, da] = d!.split("-").map(Number);
  const [h, mi] = (t ?? "00:00").split(":").map(Number);
  // Première estimation en UTC puis correction du décalage de Paris à cet instant.
  const guess = Date.UTC(y!, mo! - 1, da!, h!, mi!);
  const offset = parisOffsetMinutes(new Date(guess));
  let ts = guess - offset * 60_000;
  const offset2 = parisOffsetMinutes(new Date(ts));
  if (offset2 !== offset) ts = guess - offset2 * 60_000;
  return new Date(ts).toISOString();
}

function parisOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!m) return 0;
  const sign = m[1]!.startsWith("-") ? -1 : 1;
  return Number(m[1]) * 60 + sign * Number(m[2] ?? 0);
}

/** Durée en minutes -> "7h05" (h:mm). */
export function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

/** Écart signé : "+5 min" / "-10 min". */
export function formatOffset(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  return `${min > 0 ? "+" : ""}${min} min`;
}

export function toNumber(v: Num | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const numFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const qtyFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

export function formatKg(v: Num | undefined): string {
  const n = toNumber(v);
  return n === null ? "—" : `${numFmt.format(n)} kg`;
}

export function formatQty(v: Num | undefined): string {
  const n = toNumber(v);
  return n === null ? "—" : qtyFmt.format(n);
}

export function formatNumber(v: Num | undefined): string {
  const n = toNumber(v);
  return n === null ? "—" : numFmt.format(n);
}

export function formatPhones(phones: string[] | null | undefined): string {
  if (!phones?.length) return "—";
  return phones.map(formatPhone).join(" · ");
}

export function formatWindow(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  return `${start ?? "…"}–${end ?? "…"}`;
}

export function fullName(u: { firstName: string; lastName: string } | null | undefined): string {
  return u ? `${u.firstName} ${u.lastName}` : "—";
}
