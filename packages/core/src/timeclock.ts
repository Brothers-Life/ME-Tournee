import { roundPunch, minutesBetween, type DepotSettings } from "@me/shared";
import { and, desc, eq, isNull, type Db, timeEntries, users, depots } from "@me/db";

const today = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export async function openEntry(db: Db, userId: string) {
  const [entry] = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.endAt)))
    .orderBy(desc(timeEntries.startAt))
    .limit(1);
  return entry ?? null;
}

async function settingsOf(db: Db, depotId: string): Promise<DepotSettings> {
  const [d] = await db.select().from(depots).where(eq(depots.id, depotId));
  return d!.settings;
}

/** Prise de poste : enregistre l'heure réelle et l'heure arrondie. */
export async function startShift(db: Db, userId: string, depotId: string, at = new Date()) {
  const open = await openEntry(db, userId);
  if (open) return open;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const s = await settingsOf(db, depotId);
  const r = roundPunch(at, "start", user!.roundingOffset, s.timeRounding, s.roundingStepMinutes);
  const [entry] = await db
    .insert(timeEntries)
    .values({ userId, depotId, date: today(at), startAt: at, roundedStart: r.rounded })
    .returning();
  await db.update(users).set({ roundingOffset: r.offsetAfter }).where(eq(users.id, userId));
  return entry!;
}

export async function toggleBreak(db: Db, userId: string, at = new Date()) {
  const open = await openEntry(db, userId);
  if (!open) throw new Error("Aucune prise de poste en cours");
  if (open.breakStartedAt) {
    const minutes = Math.max(0, minutesBetween(open.breakStartedAt, at));
    const [e] = await db
      .update(timeEntries)
      .set({ breakStartedAt: null, breakMinutes: open.breakMinutes + minutes })
      .where(eq(timeEntries.id, open.id))
      .returning();
    return e!;
  }
  const [e] = await db.update(timeEntries).set({ breakStartedAt: at }).where(eq(timeEntries.id, open.id)).returning();
  return e!;
}

/** Fin de poste : arrondi avec compensation, mise à jour du compteur continu du salarié. */
export async function endShift(db: Db, userId: string, at = new Date()) {
  const open = await openEntry(db, userId);
  if (!open) throw new Error("Aucune prise de poste en cours");
  if (open.breakStartedAt) await toggleBreak(db, userId, at);
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const s = await settingsOf(db, open.depotId);
  const r = roundPunch(at, "end", user!.roundingOffset, s.timeRounding, s.roundingStepMinutes);
  const [e] = await db
    .update(timeEntries)
    .set({ endAt: at, roundedEnd: r.rounded, offsetAfter: r.offsetAfter })
    .where(eq(timeEntries.id, open.id))
    .returning();
  await db.update(users).set({ roundingOffset: r.offsetAfter }).where(eq(users.id, userId));
  return e!;
}

/** Durées en minutes : réelle et payée (arrondie), pauses déduites. */
export function durations(e: typeof timeEntries.$inferSelect) {
  if (!e.endAt) return { real: null, paid: null };
  const real = minutesBetween(e.startAt, e.endAt) - e.breakMinutes;
  const paid = e.roundedStart && e.roundedEnd ? minutesBetween(e.roundedStart, e.roundedEnd) - e.breakMinutes : real;
  return { real, paid };
}
