// Exploitation : fichiers, imports de BL, tournées, livraisons, incidents, heures, GPS, tableau de bord.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can, INCIDENT_STATUSES } from "@me/shared";
import {
  and, asc, desc, eq, gte, inArray, lte, sql, ne,
  files, imports, tours, deliveryNotes, deliveryLines, clients, users, vehicles, incidents, pickups,
  vehicleChecks, communications, timeEntries, positions, depots,
} from "@me/db";
import { autoPlan, moveNotes, reorderTour, durations } from "@me/core";
import { db, importQueue, publish, config, redis } from "../context.js";
import { parse, badRequest, notFound, todayParis } from "../lib/http.js";
import { requirePerm, scopeFor, requirePin, requireAuth } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idParam = z.object({ id: uuid });

async function tourOr404(id: string) {
  const [t] = await db.select().from(tours).where(eq(tours.id, id));
  if (!t) throw notFound("Tournée introuvable");
  return t;
}

async function noteOr404(id: string) {
  const [n] = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id));
  if (!n) throw notFound("BL introuvable");
  return n;
}

/** Détail complet d'un BL : lignes, incidents, reprise, communications, client. */
export async function noteDetail(id: string, withContacts: boolean) {
  const n = await noteOr404(id);
  const [lines, incs, pick, comms, client] = await Promise.all([
    db.select().from(deliveryLines).where(eq(deliveryLines.deliveryNoteId, id)).orderBy(asc(deliveryLines.position)),
    db.select().from(incidents).where(eq(incidents.deliveryNoteId, id)).orderBy(asc(incidents.createdAt)),
    db.select().from(pickups).where(eq(pickups.deliveryNoteId, id)),
    db.select().from(communications).where(eq(communications.deliveryNoteId, id)).orderBy(asc(communications.createdAt)),
    db.select().from(clients).where(eq(clients.id, n.clientId)),
  ]);
  const c = client[0]!;
  return {
    ...n,
    client: { id: c.id, code: c.code, name: c.name, notes: c.notes, emailSignedBl: c.emailSignedBl, phones: withContacts ? c.phones : [] },
    lines,
    incidents: incs,
    pickup: pick[0] ?? null,
    communications: withContacts ? comms : comms.map((cm) => ({ ...cm, to: "" })),
  };
}

export async function opsRoutes(app: FastifyInstance) {
  // ---------- Fichiers (photos, PDF), stockés en base ----------
  app.post("/files", async (req) => {
    const auth = requireAuth(req);
    const part = await req.file({ limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });
    if (!part) throw badRequest("Aucun fichier envoyé");
    const data = await part.toBuffer();
    const kind = (part.fields.kind as { value?: string } | undefined)?.value ?? (part.mimetype === "application/pdf" ? "pdf" : "photo");
    const [f] = await db
      .insert(files)
      .values({ name: part.filename, mime: part.mimetype, size: data.length, data, kind, createdBy: auth.userId })
      .returning({ id: files.id, name: files.name, mime: files.mime, size: files.size });
    return f;
  });

  app.get("/files/:id", async (req, reply) => {
    requireAuth(req);
    const { id } = parse(idParam, req.params);
    const [f] = await db.select().from(files).where(eq(files.id, id));
    if (!f) throw notFound("Fichier introuvable");
    reply.header("Content-Type", f.mime).header("Cache-Control", "private, max-age=86400");
    reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(f.name)}"`);
    return reply.send(f.data);
  });

  // ---------- Imports ----------
  app.get("/imports", async (req) => {
    const scope = scopeFor(req, "imports.view");
    const q = parse(z.object({ depotId: uuid.optional() }), req.query);
    const where = [];
    if (scope) where.push(inArray(imports.depotId, scope));
    if (q.depotId) where.push(eq(imports.depotId, q.depotId));
    return db
      .select({
        id: imports.id, depotId: imports.depotId, fileId: imports.fileId, fileName: imports.fileName, source: imports.source,
        status: imports.status, blCount: imports.blCount, newClients: imports.newClients, skipped: imports.skipped,
        error: imports.error, createdAt: imports.createdAt, finishedAt: imports.finishedAt,
        createdByName: sql<string | null>`${users.firstName} || ' ' || ${users.lastName}`,
      })
      .from(imports)
      .leftJoin(users, eq(users.id, imports.createdBy))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(imports.createdAt))
      .limit(100);
  });

  app.post("/imports", async (req) => {
    const body = parse(z.object({ depotId: uuid, fileId: uuid }), req.body);
    const auth = requirePerm(req, "imports.create", body.depotId);
    const [f] = await db.select({ id: files.id, name: files.name, mime: files.mime }).from(files).where(eq(files.id, body.fileId));
    if (!f) throw notFound("Fichier introuvable");
    if (f.mime !== "application/pdf") throw badRequest("Le fichier doit être un PDF");
    const [imp] = await db.insert(imports).values({ depotId: body.depotId, fileId: f.id, fileName: f.name, createdBy: auth.userId }).returning();
    await importQueue.add("import", { importId: imp!.id }, { attempts: 2, removeOnComplete: 100, removeOnFail: 100 });
    await audit(req, "import.create", "import", imp!.id, { depotId: body.depotId, after: imp });
    await publish({ type: "imports.changed", depotId: body.depotId });
    return imp;
  });

  // ---------- Tournées ----------
  app.get("/tours", async (req) => {
    const scope = scopeFor(req, "tours.view");
    const q = parse(z.object({ depotId: uuid.optional(), date: isoDate.optional(), from: isoDate.optional(), to: isoDate.optional() }), req.query);
    const where = [];
    if (scope) where.push(inArray(tours.depotId, scope));
    if (q.depotId) where.push(eq(tours.depotId, q.depotId));
    if (q.date) where.push(eq(tours.date, q.date));
    if (q.from) where.push(gte(tours.date, q.from));
    if (q.to) where.push(lte(tours.date, q.to));
    const rows = await db.select().from(tours).where(where.length ? and(...where) : undefined).orderBy(desc(tours.date), asc(tours.name)).limit(500);
    if (!rows.length) return [];
    const ids = rows.map((t) => t.id);
    const stats = await db
      .select({
        tourId: deliveryNotes.tourId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${deliveryNotes.status} in ('delivered','partial','failed'))::int`,
        packages: sql<number>`coalesce(sum(${deliveryNotes.packageCount}),0)::int`,
        weight: sql<number>`coalesce(sum(${deliveryNotes.netWeightKg}),0)::float`,
      })
      .from(deliveryNotes)
      .where(inArray(deliveryNotes.tourId, ids))
      .groupBy(deliveryNotes.tourId);
    const openInc = await db
      .select({ tourId: deliveryNotes.tourId, n: sql<number>`count(*)::int` })
      .from(incidents)
      .innerJoin(deliveryNotes, eq(deliveryNotes.id, incidents.deliveryNoteId))
      .where(and(inArray(deliveryNotes.tourId, ids), ne(incidents.status, "closed")))
      .groupBy(deliveryNotes.tourId);
    const people = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users);
    const vehs = await db.select().from(vehicles);
    return rows.map((t) => {
      const s = stats.find((x) => x.tourId === t.id);
      const d = people.find((p) => p.id === t.driverId);
      const v = vehs.find((x) => x.id === t.vehicleId);
      return {
        ...t,
        driverName: d ? `${d.firstName} ${d.lastName}` : null,
        vehicle: v ? { id: v.id, plate: v.plate, fleetNumber: v.fleetNumber, type: v.type } : null,
        total: s?.total ?? 0,
        done: s?.done ?? 0,
        packages: s?.packages ?? 0,
        weightKg: s?.weight ?? 0,
        openIncidents: openInc.find((x) => x.tourId === t.id)?.n ?? 0,
      };
    });
  });

  /** Planning d'une journée : tournées + BL de chacune + BL non affectés. */
  app.get("/planning", async (req) => {
    const q = parse(z.object({ depotId: uuid, date: isoDate }), req.query);
    requirePerm(req, "tours.view", q.depotId);
    const notes = await db
      .select({
        id: deliveryNotes.id, number: deliveryNotes.number, tourId: deliveryNotes.tourId, sequence: deliveryNotes.sequence,
        status: deliveryNotes.status, windowStart: deliveryNotes.windowStart, windowEnd: deliveryNotes.windowEnd,
        packageCount: deliveryNotes.packageCount, netWeightKg: deliveryNotes.netWeightKg, comment: deliveryNotes.comment,
        pickupRequested: deliveryNotes.pickupRequested, clientId: deliveryNotes.clientId, client: deliveryNotes.clientSnapshot,
        clientSectorId: clients.sectorId,
      })
      .from(deliveryNotes)
      .innerJoin(clients, eq(clients.id, deliveryNotes.clientId))
      .where(and(eq(deliveryNotes.depotId, q.depotId), eq(deliveryNotes.deliveryDate, q.date)))
      .orderBy(asc(deliveryNotes.sequence), asc(deliveryNotes.windowStart));
    const dayTours = await db.select().from(tours).where(and(eq(tours.depotId, q.depotId), eq(tours.date, q.date))).orderBy(asc(tours.name));
    return {
      tours: dayTours.map((t) => ({ ...t, notes: notes.filter((n) => n.tourId === t.id) })),
      unassigned: notes.filter((n) => !n.tourId),
    };
  });

  app.post("/planning/auto", async (req) => {
    const body = parse(z.object({ depotId: uuid, date: isoDate }), req.body);
    requirePerm(req, "tours.manage", body.depotId);
    const r = await autoPlan(db, body.depotId, body.date);
    await audit(req, "planning.auto", "tour", null, { depotId: body.depotId, after: { date: body.date, ...r } });
    await publish({ type: "tours.changed", depotId: body.depotId });
    return r;
  });

  app.post("/tours", async (req) => {
    const body = parse(
      z.object({ depotId: uuid, date: isoDate, name: z.string().min(1), sectorId: uuid.nullable().optional(), driverId: uuid.nullable().optional(), vehicleId: uuid.nullable().optional() }),
      req.body,
    );
    requirePerm(req, "tours.manage", body.depotId);
    const [t] = await db.insert(tours).values(body).returning();
    await audit(req, "tour.create", "tour", t!.id, { depotId: t!.depotId, after: t });
    await publish({ type: "tours.changed", depotId: t!.depotId, tourId: t!.id });
    return t;
  });

  app.patch("/tours/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const before = await tourOr404(id);
    requirePerm(req, "tours.manage", before.depotId);
    const body = parse(z.object({ name: z.string().min(1).optional(), driverId: uuid.nullable().optional(), vehicleId: uuid.nullable().optional(), sectorId: uuid.nullable().optional() }), req.body);
    if (before.status === "closed") throw badRequest("Tournée clôturée : plus de modification possible");
    const [after] = await db.update(tours).set(body).where(eq(tours.id, id)).returning();
    await audit(req, "tour.update", "tour", id, { depotId: before.depotId, before, after });
    await publish({ type: "tours.changed", depotId: before.depotId, tourId: id });
    return after;
  });

  app.post("/tours/:id/validate", async (req) => {
    const { id } = parse(idParam, req.params);
    const before = await tourOr404(id);
    const auth = requirePerm(req, "tours.validate", before.depotId);
    if (before.status !== "draft") throw badRequest("Seule une tournée brouillon peut être validée");
    if (!before.driverId) throw badRequest("Affectez un chauffeur avant de valider");
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(deliveryNotes).where(eq(deliveryNotes.tourId, id));
    if (!n) throw badRequest("La tournée ne contient aucun BL");
    const [after] = await db.update(tours).set({ status: "validated", validatedBy: auth.userId, validatedAt: new Date() }).where(eq(tours.id, id)).returning();
    await audit(req, "tour.validate", "tour", id, { depotId: before.depotId, before, after });
    await publish({ type: "tours.changed", depotId: before.depotId, tourId: id });
    return after;
  });

  app.post("/tours/:id/unvalidate", async (req) => {
    const { id } = parse(idParam, req.params);
    const before = await tourOr404(id);
    requirePerm(req, "tours.validate", before.depotId);
    if (before.status !== "validated") throw badRequest("Seule une tournée validée et pas encore partie peut repasser en brouillon");
    const [after] = await db.update(tours).set({ status: "draft", validatedBy: null, validatedAt: null }).where(eq(tours.id, id)).returning();
    await audit(req, "tour.unvalidate", "tour", id, { depotId: before.depotId, before, after });
    await publish({ type: "tours.changed", depotId: before.depotId, tourId: id });
    return after;
  });

  app.post("/tours/:id/close", async (req) => {
    const { id } = parse(idParam, req.params);
    const before = await tourOr404(id);
    requirePerm(req, "tours.validate", before.depotId);
    if (before.status !== "returned") throw badRequest("La tournée doit être revenue au dépôt pour être clôturée");
    const [after] = await db.update(tours).set({ status: "closed", closedAt: new Date() }).where(eq(tours.id, id)).returning();
    await audit(req, "tour.close", "tour", id, { depotId: before.depotId, before, after });
    await publish({ type: "tours.changed", depotId: before.depotId, tourId: id });
    return after;
  });

  app.delete("/tours/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const before = await tourOr404(id);
    requirePerm(req, "tours.delete", before.depotId);
    await requirePin(req);
    if (!["draft", "validated"].includes(before.status)) throw badRequest("Une tournée commencée ne peut pas être supprimée");
    await db.update(deliveryNotes).set({ tourId: null, sequence: 0 }).where(eq(deliveryNotes.tourId, id));
    await db.delete(tours).where(eq(tours.id, id));
    await audit(req, "tour.delete", "tour", id, { depotId: before.depotId, before });
    await publish({ type: "tours.changed", depotId: before.depotId });
    return { ok: true };
  });

  // Déplacer des BL entre tournées (glisser-déposer) et réordonner.
  app.post("/planning/move", async (req) => {
    const body = parse(z.object({ noteIds: z.array(uuid).min(1), tourId: uuid.nullable() }), req.body);
    const notes = await db.select().from(deliveryNotes).where(inArray(deliveryNotes.id, body.noteIds));
    const depotIds = [...new Set(notes.map((n) => n.depotId))];
    for (const d of depotIds) requirePerm(req, "tours.manage", d);
    if (notes.some((n) => n.status !== "pending")) throw badRequest("Un BL déjà livré ne peut plus changer de tournée");
    const touched = new Set(notes.map((n) => n.tourId).filter(Boolean) as string[]);
    if (body.tourId) {
      const t = await tourOr404(body.tourId);
      if (!depotIds.every((d) => d === t.depotId)) throw badRequest("Le BL et la tournée doivent être dans le même dépôt");
      if (["returned", "closed"].includes(t.status)) throw badRequest("Cette tournée est terminée");
      touched.add(t.id);
    }
    for (const tid of touched) {
      const t = await tourOr404(tid);
      if (["returned", "closed"].includes(t.status)) throw badRequest("Une des tournées concernées est terminée");
    }
    await moveNotes(db, body.noteIds, body.tourId);
    await audit(req, "planning.move", "delivery_note", null, { depotId: depotIds[0], before: notes.map((n) => ({ id: n.id, tourId: n.tourId })), after: { tourId: body.tourId } });
    for (const d of depotIds) await publish({ type: "tours.changed", depotId: d });
    return { ok: true };
  });

  app.post("/tours/:id/reorder", async (req) => {
    const { id } = parse(idParam, req.params);
    const t = await tourOr404(id);
    requirePerm(req, "tours.manage", t.depotId);
    const body = parse(z.object({ noteIds: z.array(uuid) }), req.body);
    await reorderTour(db, id, body.noteIds);
    await audit(req, "tour.reorder", "tour", id, { depotId: t.depotId, after: body.noteIds });
    await publish({ type: "tours.changed", depotId: t.depotId, tourId: id });
    return { ok: true };
  });

  /** Détail d'une tournée : BL, contrôles du camion, chauffeur, trace GPS si autorisé. */
  app.get("/tours/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const t = await tourOr404(id);
    const auth = requirePerm(req, "tours.view", t.depotId);
    const notes = await db.select().from(deliveryNotes).where(eq(deliveryNotes.tourId, id)).orderBy(asc(deliveryNotes.sequence));
    const checks = await db.select().from(vehicleChecks).where(eq(vehicleChecks.tourId, id));
    const [driver] = t.driverId ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, phone: users.phone }).from(users).where(eq(users.id, t.driverId)) : [];
    const [vehicle] = t.vehicleId ? await db.select().from(vehicles).where(eq(vehicles.id, t.vehicleId)) : [];
    const incs = notes.length
      ? await db.select().from(incidents).where(inArray(incidents.deliveryNoteId, notes.map((n) => n.id)))
      : [];
    const lastPos = can(auth.perms, "gps.live", t.depotId) && t.driverId ? await redis.get(`pos:${t.driverId}`) : null;
    return { ...t, notes, checks, driver: driver ?? null, vehicle: vehicle ?? null, incidents: incs, lastPosition: lastPos ? JSON.parse(lastPos) : null };
  });

  // ---------- Livraisons (BL) ----------
  app.get("/deliveries", async (req) => {
    const scope = scopeFor(req, "deliveries.view");
    const q = parse(
      z.object({ depotId: uuid.optional(), date: isoDate.optional(), clientId: uuid.optional(), status: z.string().optional(), search: z.string().optional(), limit: z.coerce.number().int().max(500).default(200) }),
      req.query,
    );
    const where = [];
    if (scope) where.push(inArray(deliveryNotes.depotId, scope));
    if (q.depotId) where.push(eq(deliveryNotes.depotId, q.depotId));
    if (q.date) where.push(eq(deliveryNotes.deliveryDate, q.date));
    if (q.clientId) where.push(eq(deliveryNotes.clientId, q.clientId));
    if (q.status) where.push(eq(deliveryNotes.status, q.status as "pending"));
    if (q.search) where.push(sql`(${deliveryNotes.number} ilike ${"%" + q.search + "%"} or ${deliveryNotes.clientSnapshot}->>'name' ilike ${"%" + q.search + "%"})`);
    return db
      .select({
        id: deliveryNotes.id, number: deliveryNotes.number, depotId: deliveryNotes.depotId, deliveryDate: deliveryNotes.deliveryDate,
        status: deliveryNotes.status, client: deliveryNotes.clientSnapshot, tourId: deliveryNotes.tourId, tourName: tours.name,
        packageCount: deliveryNotes.packageCount, completedAt: deliveryNotes.completedAt, windowStart: deliveryNotes.windowStart, windowEnd: deliveryNotes.windowEnd,
      })
      .from(deliveryNotes)
      .leftJoin(tours, eq(tours.id, deliveryNotes.tourId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(deliveryNotes.deliveryDate), asc(deliveryNotes.number))
      .limit(q.limit);
  });

  app.get("/deliveries/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const n = await noteOr404(id);
    const auth = requirePerm(req, "deliveries.view", n.depotId);
    return noteDetail(id, can(auth.perms, "clients.contacts", n.depotId));
  });

  // ---------- Incidents ----------
  app.get("/incidents", async (req) => {
    const scope = scopeFor(req, "incidents.view");
    const q = parse(z.object({ depotId: uuid.optional(), status: z.enum(INCIDENT_STATUSES).optional(), from: isoDate.optional(), to: isoDate.optional() }), req.query);
    const where = [];
    if (scope) where.push(inArray(deliveryNotes.depotId, scope));
    if (q.depotId) where.push(eq(deliveryNotes.depotId, q.depotId));
    if (q.status) where.push(eq(incidents.status, q.status));
    if (q.from) where.push(gte(deliveryNotes.deliveryDate, q.from));
    if (q.to) where.push(lte(deliveryNotes.deliveryDate, q.to));
    const rows = await db
      .select({
        incident: incidents,
        note: { id: deliveryNotes.id, number: deliveryNotes.number, depotId: deliveryNotes.depotId, deliveryDate: deliveryNotes.deliveryDate, client: deliveryNotes.clientSnapshot, tourId: deliveryNotes.tourId },
        line: { designation: deliveryLines.designation, articleCode: deliveryLines.articleCode, quantity: deliveryLines.quantity, unit: deliveryLines.unit },
        createdByName: sql<string | null>`${users.firstName} || ' ' || ${users.lastName}`,
      })
      .from(incidents)
      .innerJoin(deliveryNotes, eq(deliveryNotes.id, incidents.deliveryNoteId))
      .leftJoin(deliveryLines, eq(deliveryLines.id, incidents.lineId))
      .leftJoin(users, eq(users.id, incidents.createdBy))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(incidents.createdAt))
      .limit(300);
    return rows.map((r) => ({ ...r.incident, note: r.note, line: r.line?.designation ? r.line : null, createdByName: r.createdByName }));
  });

  app.patch("/incidents/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const [before] = await db.select().from(incidents).where(eq(incidents.id, id));
    if (!before) throw notFound();
    const n = await noteOr404(before.deliveryNoteId);
    const auth = requirePerm(req, "incidents.manage", n.depotId);
    const body = parse(z.object({ status: z.enum(INCIDENT_STATUSES), handledComment: z.string().max(2000).nullable().optional() }), req.body);
    const [after] = await db
      .update(incidents)
      .set({ status: body.status, handledComment: body.handledComment ?? before.handledComment, handledBy: auth.userId, handledAt: new Date() })
      .where(eq(incidents.id, id))
      .returning();
    await audit(req, "incident.update", "incident", id, { depotId: n.depotId, before, after });
    await publish({ type: "incidents.changed", depotId: n.depotId });
    return after;
  });

  // ---------- Heures ----------
  app.get("/time-entries", async (req) => {
    const scope = scopeFor(req, "time.view");
    const q = parse(z.object({ depotId: uuid.optional(), userId: uuid.optional(), from: isoDate, to: isoDate }), req.query);
    const where = [gte(timeEntries.date, q.from), lte(timeEntries.date, q.to)];
    if (scope) where.push(inArray(timeEntries.depotId, scope));
    if (q.depotId) where.push(eq(timeEntries.depotId, q.depotId));
    if (q.userId) where.push(eq(timeEntries.userId, q.userId));
    const rows = await db
      .select({ e: timeEntries, firstName: users.firstName, lastName: users.lastName, roundingOffset: users.roundingOffset })
      .from(timeEntries)
      .innerJoin(users, eq(users.id, timeEntries.userId))
      .where(and(...where))
      .orderBy(desc(timeEntries.date), asc(users.lastName));
    return rows.map((r) => ({ ...r.e, userName: `${r.firstName} ${r.lastName}`, currentOffset: r.roundingOffset, ...durations(r.e) }));
  });

  /** Correction manuelle d'un pointage (PIN requis). L'arrondi est recalculé simplement au plus proche. */
  app.patch("/time-entries/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const [before] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
    if (!before) throw notFound();
    const auth = requirePerm(req, "time.manage", before.depotId);
    await requirePin(req);
    const body = parse(
      z.object({ startAt: z.string().datetime().optional(), endAt: z.string().datetime().nullable().optional(), breakMinutes: z.number().int().min(0).optional(), roundedStart: z.string().datetime().optional(), roundedEnd: z.string().datetime().nullable().optional(), note: z.string().max(500) }),
      req.body,
    );
    const [after] = await db
      .update(timeEntries)
      .set({
        startAt: body.startAt ? new Date(body.startAt) : before.startAt,
        endAt: body.endAt === undefined ? before.endAt : body.endAt ? new Date(body.endAt) : null,
        breakMinutes: body.breakMinutes ?? before.breakMinutes,
        roundedStart: body.roundedStart ? new Date(body.roundedStart) : before.roundedStart,
        roundedEnd: body.roundedEnd === undefined ? before.roundedEnd : body.roundedEnd ? new Date(body.roundedEnd) : null,
        note: body.note,
        correctedBy: auth.userId,
      })
      .where(eq(timeEntries.id, id))
      .returning();
    await audit(req, "time.correct", "time_entry", id, { depotId: before.depotId, before, after });
    return after;
  });

  app.get("/time-entries/export", async (req, reply) => {
    const scope = scopeFor(req, "time.export");
    const q = parse(z.object({ depotId: uuid.optional(), from: isoDate, to: isoDate }), req.query);
    const where = [gte(timeEntries.date, q.from), lte(timeEntries.date, q.to)];
    if (scope) where.push(inArray(timeEntries.depotId, scope));
    if (q.depotId) where.push(eq(timeEntries.depotId, q.depotId));
    const rows = await db
      .select({ e: timeEntries, firstName: users.firstName, lastName: users.lastName, login: users.login, depot: depots.code })
      .from(timeEntries)
      .innerJoin(users, eq(users.id, timeEntries.userId))
      .innerJoin(depots, eq(depots.id, timeEntries.depotId))
      .where(and(...where))
      .orderBy(asc(users.lastName), asc(timeEntries.date));
    const hm = (d: Date | null) => (d ? d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }) : "");
    const lines = ["Dépôt;Matricule;Nom;Prénom;Date;Début réel;Fin réelle;Début arrondi;Fin arrondie;Pause (min);Durée réelle (min);Durée payée (min);Écart cumulé (min)"];
    for (const r of rows) {
      const d = durations(r.e);
      lines.push([r.depot, r.login ?? "", r.lastName, r.firstName, r.e.date, hm(r.e.startAt), hm(r.e.endAt), hm(r.e.roundedStart), hm(r.e.roundedEnd), r.e.breakMinutes, d.real ?? "", d.paid ?? "", r.e.offsetAfter ?? ""].join(";"));
    }
    await audit(req, "time.export", "time_entry", null, { depotId: q.depotId ?? null, after: q });
    reply.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", `attachment; filename="heures_${q.from}_${q.to}.csv"`);
    return "﻿" + lines.join("\r\n");
  });

  // ---------- GPS ----------
  app.get("/gps/live", async (req) => {
    const scope = scopeFor(req, "gps.live");
    const today = todayParis();
    const active = await db
      .select({ tour: tours, firstName: users.firstName, lastName: users.lastName })
      .from(tours)
      .innerJoin(users, eq(users.id, tours.driverId))
      .where(and(eq(tours.date, today), eq(tours.status, "in_progress"), scope ? inArray(tours.depotId, scope) : undefined));
    const out = [];
    for (const a of active) {
      const raw = await redis.get(`pos:${a.tour.driverId}`);
      out.push({ tourId: a.tour.id, tourName: a.tour.name, depotId: a.tour.depotId, driverName: `${a.firstName} ${a.lastName}`, position: raw ? JSON.parse(raw) : null });
    }
    return out;
  });

  app.get("/gps/history", async (req) => {
    const q = parse(z.object({ tourId: uuid }), req.query);
    const t = await tourOr404(q.tourId);
    requirePerm(req, "gps.history", t.depotId);
    await requirePin(req);
    const pts = await db.select().from(positions).where(eq(positions.tourId, q.tourId)).orderBy(asc(positions.recordedAt));
    await audit(req, "gps.history_view", "tour", q.tourId, { depotId: t.depotId });
    return pts;
  });

  // ---------- Tableau de bord ----------
  app.get("/dashboard", async (req) => {
    const scope = scopeFor(req, "dashboard.view");
    const q = parse(z.object({ depotId: uuid.optional(), date: isoDate.optional() }), req.query);
    const date = q.date ?? todayParis();
    const depotFilter = (col: typeof deliveryNotes.depotId | typeof tours.depotId) =>
      q.depotId ? eq(col, q.depotId) : scope ? inArray(col, scope) : undefined;
    const [notesStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        delivered: sql<number>`count(*) filter (where ${deliveryNotes.status} in ('delivered','partial'))::int`,
        failed: sql<number>`count(*) filter (where ${deliveryNotes.status} = 'failed')::int`,
        unassigned: sql<number>`count(*) filter (where ${deliveryNotes.tourId} is null)::int`,
        packages: sql<number>`coalesce(sum(${deliveryNotes.packageCount}),0)::int`,
      })
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.deliveryDate, date), depotFilter(deliveryNotes.depotId)));
    const tourRows = await db
      .select({ status: tours.status, n: sql<number>`count(*)::int` })
      .from(tours)
      .where(and(eq(tours.date, date), depotFilter(tours.depotId)))
      .groupBy(tours.status);
    const incidentScope = scopeFor(req, "dashboard.view");
    const [openIncidents] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(incidents)
      .innerJoin(deliveryNotes, eq(deliveryNotes.id, incidents.deliveryNoteId))
      .where(and(ne(incidents.status, "closed"), q.depotId ? eq(deliveryNotes.depotId, q.depotId) : incidentScope ? inArray(deliveryNotes.depotId, incidentScope) : undefined));
    const anomalies = await db
      .select({ check: vehicleChecks, tourName: tours.name, plate: vehicles.plate })
      .from(vehicleChecks)
      .innerJoin(tours, eq(tours.id, vehicleChecks.tourId))
      .innerJoin(vehicles, eq(vehicles.id, vehicleChecks.vehicleId))
      .where(and(eq(tours.date, date), eq(vehicleChecks.hasAnomaly, true), depotFilter(tours.depotId)));
    return {
      date,
      notes: notesStats,
      tours: Object.fromEntries(tourRows.map((r) => [r.status, r.n])),
      openIncidents: openIncidents?.n ?? 0,
      vehicleAnomalies: anomalies.map((a) => ({ ...a.check, tourName: a.tourName, plate: a.plate })),
    };
  });
}
