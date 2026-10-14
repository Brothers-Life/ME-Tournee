import { and, asc, eq, inArray, isNull, sql, type Db, deliveryNotes, sectors, tours, clients } from "@me/db";

type SectorRow = typeof sectors.$inferSelect;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/**
 * Trouve le secteur d'un client : son secteur fixé à la main d'abord, sinon la ville,
 * sinon le code postal le plus précis (un secteur peut contenir des préfixes comme "40").
 */
export function matchSector(
  list: SectorRow[],
  client: { sectorId: string | null; postalCode: string | null; city: string | null },
): SectorRow | null {
  if (client.sectorId) {
    const fixed = list.find((s) => s.id === client.sectorId);
    if (fixed) return fixed;
  }
  if (client.city) {
    const city = norm(client.city);
    const byCity = list.find((s) => s.cities.some((c) => norm(c) === city));
    if (byCity) return byCity;
  }
  if (client.postalCode) {
    let best: { sector: SectorRow; len: number } | null = null;
    for (const s of list) {
      for (const p of s.postalCodes) {
        const prefix = p.trim();
        if (prefix && client.postalCode.startsWith(prefix) && (!best || prefix.length > best.len)) {
          best = { sector: s, len: prefix.length };
        }
      }
    }
    if (best) return best.sector;
  }
  return null;
}

const frDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Répartit les BL non affectés d'une date dans des tournées brouillon, une par secteur.
 * Les BL sans secteur restent « à répartir ». Renvoie le nombre de BL placés.
 */
export async function autoPlan(db: Db, depotId: string, date: string): Promise<{ placed: number; unassigned: number }> {
  const depotSectors = await db.select().from(sectors).where(eq(sectors.depotId, depotId)).orderBy(asc(sectors.sortOrder));
  const pending = await db
    .select({ dn: deliveryNotes, client: clients })
    .from(deliveryNotes)
    .innerJoin(clients, eq(clients.id, deliveryNotes.clientId))
    .where(and(eq(deliveryNotes.depotId, depotId), eq(deliveryNotes.deliveryDate, date), isNull(deliveryNotes.tourId)));

  const bySector = new Map<string, typeof pending>();
  let unassigned = 0;
  for (const row of pending) {
    const sector = matchSector(depotSectors, row.client);
    if (!sector) {
      unassigned++;
      continue;
    }
    const list = bySector.get(sector.id) ?? [];
    list.push(row);
    bySector.set(sector.id, list);
  }

  let placed = 0;
  for (const [sectorId, rows] of bySector) {
    const sector = depotSectors.find((s) => s.id === sectorId)!;
    let [tour] = await db
      .select()
      .from(tours)
      .where(and(eq(tours.depotId, depotId), eq(tours.date, date), eq(tours.sectorId, sectorId), eq(tours.status, "draft")));
    if (!tour) {
      [tour] = await db
        .insert(tours)
        .values({
          depotId,
          date,
          sectorId,
          name: `${sector.name} ${frDate(date)}`,
          driverId: sector.defaultDriverId,
          vehicleId: sector.defaultVehicleId,
        })
        .returning();
    }
    const [{ max } = { max: 0 }] = await db
      .select({ max: sql<number>`coalesce(max(${deliveryNotes.sequence}), 0)` })
      .from(deliveryNotes)
      .where(eq(deliveryNotes.tourId, tour!.id));
    // Ordre de passage : créneau le plus tôt d'abord, puis code postal pour grouper les villes.
    rows.sort((a, b) =>
      (a.dn.windowStart ?? "99").localeCompare(b.dn.windowStart ?? "99") ||
      (a.client.postalCode ?? "").localeCompare(b.client.postalCode ?? ""),
    );
    let seq = Number(max);
    for (const row of rows) {
      seq++;
      await db.update(deliveryNotes).set({ tourId: tour!.id, sequence: seq }).where(eq(deliveryNotes.id, row.dn.id));
      placed++;
    }
  }
  return { placed, unassigned };
}

/** Renumérote les BL d'une tournée dans l'ordre donné. */
export async function reorderTour(db: Db, tourId: string, orderedIds: string[]) {
  const current = await db.select({ id: deliveryNotes.id }).from(deliveryNotes).where(eq(deliveryNotes.tourId, tourId));
  const known = new Set(current.map((c) => c.id));
  const ids = orderedIds.filter((id) => known.has(id));
  for (const [i, id] of ids.entries()) {
    await db.update(deliveryNotes).set({ sequence: i + 1 }).where(eq(deliveryNotes.id, id));
  }
}

/** Déplace des BL vers une tournée (ou les sort de toute tournée si tourId est null). */
export async function moveNotes(db: Db, noteIds: string[], tourId: string | null) {
  if (noteIds.length === 0) return;
  let seq = 0;
  if (tourId) {
    const [{ max } = { max: 0 }] = await db
      .select({ max: sql<number>`coalesce(max(${deliveryNotes.sequence}), 0)` })
      .from(deliveryNotes)
      .where(eq(deliveryNotes.tourId, tourId));
    seq = Number(max);
  }
  for (const id of noteIds) {
    seq++;
    await db.update(deliveryNotes).set({ tourId, sequence: tourId ? seq : 0 }).where(inArray(deliveryNotes.id, [id]));
  }
}
