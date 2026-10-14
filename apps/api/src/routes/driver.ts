// API de l'app chauffeur. Le chauffeur n'agit que sur ses propres tournées.
// Les créations envoyées depuis le mode hors-ligne portent un id généré par l'app : les
// rejouer ne crée pas de doublon.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  departureCheckSchema, returnCheckSchema, incidentCreateSchema, pickupSchema, completeDeliverySchema, positionsSchema,
} from "@me/shared";
import {
  and, asc, eq, inArray, isNull, or, sql,
  tours, deliveryNotes, deliveryLines, vehicles, vehicleChecks, incidents, pickups, communications, positions,
  depots, smsTemplates, incidentTypes, userRoles, roles,
} from "@me/db";
import { startShift, endShift, toggleBreak, openEntry } from "@me/core";
import { db, publish, redis } from "../context.js";
import { parse, badRequest, notFound, forbidden, todayParis } from "../lib/http.js";
import { requirePerm } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { noteDetail } from "./ops.js";

const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });

function me(req: FastifyRequest) {
  return requirePerm(req, "driver.app");
}

async function myTour(req: FastifyRequest, id: string) {
  const auth = me(req);
  const [t] = await db.select().from(tours).where(eq(tours.id, id));
  if (!t) throw notFound("Tournée introuvable");
  if (t.driverId !== auth.userId) throw forbidden("Cette tournée n'est pas la vôtre");
  return t;
}

async function myNote(req: FastifyRequest, id: string) {
  const [n] = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id));
  if (!n || !n.tourId) throw notFound("BL introuvable");
  const t = await myTour(req, n.tourId);
  if (t.status !== "in_progress") throw badRequest("La tournée n'est pas en cours");
  return { note: n, tour: t };
}

/** Dépôt de rattachement du chauffeur (son premier rôle avec l'app chauffeur). */
async function driverDepot(userId: string): Promise<string | null> {
  const rows = await db
    .select({ depotId: userRoles.depotId, permissions: roles.permissions })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.find((r) => r.depotId && r.permissions.includes("driver.app"))?.depotId ?? rows.find((r) => r.depotId)?.depotId ?? null;
}

export async function driverRoutes(app: FastifyInstance) {
  /** Tout ce qu'il faut pour la journée, mis en cache par l'app pour le hors-ligne. */
  app.get("/driver/today", async (req) => {
    const auth = me(req);
    const date = todayParis();
    const myTours = await db
      .select()
      .from(tours)
      .where(and(eq(tours.driverId, auth.userId), or(eq(tours.date, date), inArray(tours.status, ["in_progress", "returned"]))))
      .orderBy(asc(tours.date), asc(tours.name));
    const visible = myTours.filter((t) => t.status !== "draft" && t.status !== "closed");
    const depotId = visible[0]?.depotId ?? (await driverDepot(auth.userId));
    const [depot] = depotId ? await db.select().from(depots).where(eq(depots.id, depotId)) : [];
    const tourDetails = [];
    for (const t of visible) {
      const notes = await db.select({ id: deliveryNotes.id }).from(deliveryNotes).where(eq(deliveryNotes.tourId, t.id)).orderBy(asc(deliveryNotes.sequence));
      const checks = await db.select().from(vehicleChecks).where(eq(vehicleChecks.tourId, t.id));
      tourDetails.push({ ...t, checks, notes: await Promise.all(notes.map((n) => noteDetail(n.id, true))) });
    }
    return {
      date,
      depot: depot ? { id: depot.id, code: depot.code, name: depot.name, settings: depot.settings } : null,
      shift: await openEntry(db, auth.userId),
      tours: tourDetails,
      vehicles: depotId ? await db.select().from(vehicles).where(and(eq(vehicles.depotId, depotId), eq(vehicles.isActive, true))).orderBy(asc(vehicles.fleetNumber)) : [],
      smsTemplates: await db
        .select()
        .from(smsTemplates)
        .where(depotId ? or(isNull(smsTemplates.depotId), eq(smsTemplates.depotId, depotId)) : isNull(smsTemplates.depotId))
        .orderBy(asc(smsTemplates.sortOrder)),
      incidentTypes: await db.select().from(incidentTypes).where(eq(incidentTypes.isActive, true)).orderBy(asc(incidentTypes.sortOrder)),
    };
  });

  // ---------- Pointage ----------
  app.post("/driver/shift/start", async (req) => {
    const auth = me(req);
    const body = parse(z.object({ at: z.string().datetime().optional() }), req.body ?? {});
    const depotId = await driverDepot(auth.userId);
    if (!depotId) throw badRequest("Aucun dépôt de rattachement : contactez votre responsable");
    const e = await startShift(db, auth.userId, depotId, body.at ? new Date(body.at) : new Date());
    await audit(req, "shift.start", "time_entry", e.id, { depotId });
    return e;
  });

  app.post("/driver/shift/break", async (req) => {
    const auth = me(req);
    const body = parse(z.object({ at: z.string().datetime().optional() }), req.body ?? {});
    return toggleBreak(db, auth.userId, body.at ? new Date(body.at) : new Date());
  });

  app.post("/driver/shift/end", async (req) => {
    const auth = me(req);
    const body = parse(z.object({ at: z.string().datetime().optional() }), req.body ?? {});
    const e = await endShift(db, auth.userId, body.at ? new Date(body.at) : new Date());
    await audit(req, "shift.end", "time_entry", e.id, { depotId: e.depotId });
    return e;
  });

  // ---------- Départ : contrôle du camion ----------
  app.post("/driver/tours/:id/departure", async (req) => {
    const { id } = parse(idParam, req.params);
    const t = await myTour(req, id);
    const body = parse(departureCheckSchema, req.body);
    if (t.status === "in_progress") return t; // déjà parti (rejeu hors-ligne)
    if (t.status !== "validated") throw badRequest("La tournée n'est pas validée par le responsable");
    const [veh] = await db.select().from(vehicles).where(eq(vehicles.id, body.vehicleId));
    if (!veh || veh.depotId !== t.depotId) throw badRequest("Véhicule inconnu dans ce dépôt");
    const [depot] = await db.select().from(depots).where(eq(depots.id, t.depotId));
    if (depot!.settings.temperatureEnabled && depot!.settings.temperatureRequired && (body.temperature ?? null) === null) {
      throw badRequest("Le relevé de température est obligatoire dans ce dépôt");
    }
    const hasAnomaly = !body.clean || body.warningLights || !body.fridgeOk || !!body.comment?.trim();
    await db
      .insert(vehicleChecks)
      .values({
        tourId: id, vehicleId: body.vehicleId, driverId: req.auth!.userId, kind: "departure", km: body.km, kmPhotoId: body.kmPhotoId ?? null,
        clean: body.clean, fuelFull: body.fuelFull, warningLights: body.warningLights, fridgeOk: body.fridgeOk,
        temperature: body.temperature?.toString() ?? null, palettes: body.palettes ?? null, comment: body.comment ?? null, photoIds: body.photoIds, hasAnomaly,
      })
      .onConflictDoNothing();
    const [after] = await db.update(tours).set({ status: "in_progress", vehicleId: body.vehicleId, startedAt: new Date() }).where(eq(tours.id, id)).returning();
    // Si le chauffeur n'a pas pointé, la prise de poste démarre au départ.
    if (!(await openEntry(db, req.auth!.userId))) await startShift(db, req.auth!.userId, t.depotId);
    await audit(req, "tour.departure", "tour", id, { depotId: t.depotId, before: t, after: { ...after, check: body } });
    await publish({ type: "tours.changed", depotId: t.depotId, tourId: id });
    if (hasAnomaly) await publish({ type: "vehicle_check.anomaly", depotId: t.depotId, tourId: id });
    return after;
  });

  // ---------- Chez le client ----------
  app.post("/driver/notes/:id/arrive", async (req) => {
    const { id } = parse(idParam, req.params);
    const { note, tour } = await myNote(req, id);
    const body = parse(z.object({ lat: z.number().nullable().optional(), lng: z.number().nullable().optional(), at: z.string().datetime().optional() }), req.body ?? {});
    if (note.arrivedAt) return note;
    const [after] = await db
      .update(deliveryNotes)
      .set({ status: note.status === "pending" ? "arrived" : note.status, arrivedAt: body.at ? new Date(body.at) : new Date(), arrivalLat: body.lat ?? null, arrivalLng: body.lng ?? null })
      .where(eq(deliveryNotes.id, id))
      .returning();
    await publish({ type: "deliveries.changed", depotId: tour.depotId, tourId: tour.id });
    return after;
  });

  app.put("/driver/notes/:id/lines", async (req) => {
    const { id } = parse(idParam, req.params);
    await myNote(req, id);
    const body = parse(z.object({ lines: z.array(z.object({ id: uuid, checkStatus: z.enum(["unchecked", "ok", "issue"]) })) }), req.body);
    for (const l of body.lines) {
      await db.update(deliveryLines).set({ checkStatus: l.checkStatus }).where(and(eq(deliveryLines.id, l.id), eq(deliveryLines.deliveryNoteId, id)));
    }
    return { ok: true };
  });

  app.post("/driver/notes/:id/incidents", async (req) => {
    const { id } = parse(idParam, req.params);
    const { tour } = await myNote(req, id);
    const body = parse(incidentCreateSchema, req.body);
    const [created] = await db
      .insert(incidents)
      .values({
        id: body.id, deliveryNoteId: id, lineId: body.lineId ?? null, type: body.type, quantity: body.quantity?.toString() ?? null,
        action: body.action ?? null, comment: body.comment ?? null, photoIds: body.photoIds, createdBy: req.auth!.userId,
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      if (body.lineId) await db.update(deliveryLines).set({ checkStatus: "issue" }).where(eq(deliveryLines.id, body.lineId));
      await audit(req, "incident.create", "incident", body.id, { depotId: tour.depotId, after: created });
      await publish({ type: "incidents.changed", depotId: tour.depotId });
    }
    return created ?? (await db.select().from(incidents).where(eq(incidents.id, body.id)))[0];
  });

  app.delete("/driver/incidents/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const [inc] = await db.select().from(incidents).where(eq(incidents.id, id));
    if (!inc) return { ok: true };
    const { note, tour } = await myNote(req, inc.deliveryNoteId);
    if (["delivered", "partial", "failed"].includes(note.status)) throw badRequest("Livraison terminée : l'incident ne peut plus être retiré");
    await db.delete(incidents).where(eq(incidents.id, id));
    await audit(req, "incident.delete", "incident", id, { depotId: tour.depotId, before: inc });
    await publish({ type: "incidents.changed", depotId: tour.depotId });
    return { ok: true };
  });

  app.put("/driver/notes/:id/pickup", async (req) => {
    const { id } = parse(idParam, req.params);
    const { tour } = await myNote(req, id);
    const body = parse(pickupSchema, req.body);
    const values = { done: body.done, quantity: body.quantity?.toString() ?? null, comment: body.comment ?? null, photoIds: body.photoIds, createdBy: req.auth!.userId };
    await db.insert(pickups).values({ deliveryNoteId: id, ...values }).onConflictDoUpdate({ target: pickups.deliveryNoteId, set: values });
    await audit(req, "pickup.save", "delivery_note", id, { depotId: tour.depotId, after: body });
    return { ok: true };
  });

  app.post("/driver/notes/:id/communications", async (req) => {
    const { id } = parse(idParam, req.params);
    const { tour } = await myNote(req, id);
    const body = parse(z.object({ kind: z.enum(["call", "sms"]), to: z.string().min(6), body: z.string().max(1000).nullable().optional() }), req.body);
    const [c] = await db.insert(communications).values({ deliveryNoteId: id, userId: req.auth!.userId, kind: body.kind, to: body.to, body: body.body ?? null }).returning();
    await publish({ type: "deliveries.changed", depotId: tour.depotId, tourId: tour.id });
    return c;
  });

  app.post("/driver/notes/:id/complete", async (req) => {
    const { id } = parse(idParam, req.params);
    const { note, tour } = await myNote(req, id);
    const body = parse(completeDeliverySchema, req.body);
    if (["delivered", "partial", "failed"].includes(note.status)) return note;
    const [depot] = await db.select().from(depots).where(eq(depots.id, tour.depotId));
    const s = depot!.settings;
    if (body.status !== "failed" && s.requireSignedBlPhoto && !body.signedBlPhotoId) throw badRequest("Photo du BL signé obligatoire");
    if (body.status !== "failed" && s.temperatureEnabled && s.temperatureRequired && (body.temperature ?? null) === null) throw badRequest("Relevé de température obligatoire");
    if (note.pickupRequested) {
      const [p] = await db.select().from(pickups).where(eq(pickups.deliveryNoteId, id));
      if (!p) throw badRequest("Indiquez si la reprise demandée a été faite");
    }
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(incidents).where(eq(incidents.deliveryNoteId, id));
    const status = body.status === "delivered" && n > 0 ? "partial" : body.status;
    const [after] = await db
      .update(deliveryNotes)
      .set({
        status, completedAt: new Date(), completedLat: body.lat ?? null, completedLng: body.lng ?? null, signerName: body.signerName ?? null,
        signedBlPhotoId: body.signedBlPhotoId ?? null, temperature: body.temperature?.toString() ?? null, driverComment: body.comment ?? null,
        arrivedAt: note.arrivedAt ?? new Date(),
      })
      .where(eq(deliveryNotes.id, id))
      .returning();
    await db.update(deliveryLines).set({ checkStatus: "ok" }).where(and(eq(deliveryLines.deliveryNoteId, id), eq(deliveryLines.checkStatus, "unchecked")));
    await audit(req, "delivery.complete", "delivery_note", id, { depotId: tour.depotId, before: note, after });
    await publish({ type: "deliveries.changed", depotId: tour.depotId, tourId: tour.id });
    return after;
  });

  // ---------- GPS : uniquement pendant une tournée en cours ----------
  app.post("/driver/positions", async (req) => {
    const auth = me(req);
    const body = parse(positionsSchema, req.body);
    if (!body.points.length) return { ok: true };
    const [t] = body.tourId ? await db.select().from(tours).where(eq(tours.id, body.tourId)) : [];
    if (!t || t.driverId !== auth.userId || t.status !== "in_progress") return { ok: true, ignored: true };
    await db.insert(positions).values(
      body.points.map((p) => ({ userId: auth.userId, tourId: t.id, lat: p.lat, lng: p.lng, accuracy: p.accuracy ?? null, recordedAt: new Date(p.at) })),
    );
    const last = body.points[body.points.length - 1]!;
    await redis.set(`pos:${auth.userId}`, JSON.stringify({ lat: last.lat, lng: last.lng, at: last.at, tourId: t.id }), "EX", 12 * 3600);
    await publish({ type: "positions.changed", depotId: t.depotId, userId: auth.userId, lat: last.lat, lng: last.lng, at: last.at, tourId: t.id });
    return { ok: true };
  });

  // ---------- Retour au dépôt ----------
  app.post("/driver/tours/:id/return", async (req) => {
    const { id } = parse(idParam, req.params);
    const t = await myTour(req, id);
    const body = parse(returnCheckSchema, req.body);
    if (t.status === "returned") return t;
    if (t.status !== "in_progress") throw badRequest("La tournée n'est pas en cours");
    const pending = await db
      .select({ id: deliveryNotes.id })
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.tourId, id), inArray(deliveryNotes.status, ["pending", "arrived"])));
    if (pending.length) throw badRequest(`Il reste ${pending.length} BL sans statut : livrez-les ou marquez-les « non livré »`);
    const [dep] = await db.select().from(vehicleChecks).where(and(eq(vehicleChecks.tourId, id), eq(vehicleChecks.kind, "departure")));
    if (dep && body.km < dep.km) throw badRequest(`Km de retour inférieurs aux km de départ (${dep.km})`);
    await db
      .insert(vehicleChecks)
      .values({
        tourId: id, vehicleId: t.vehicleId!, driverId: req.auth!.userId, kind: "return", km: body.km, kmPhotoId: body.kmPhotoId ?? null,
        clean: body.cleaned, temperature: body.temperature?.toString() ?? null, palettes: body.palettes ?? null, comment: body.comment ?? null,
        photoIds: body.returnsPhotoIds, hasAnomaly: !body.cleaned || !!body.comment?.trim(),
      })
      .onConflictDoNothing();
    const [after] = await db.update(tours).set({ status: "returned", returnedAt: new Date() }).where(eq(tours.id, id)).returning();
    await redis.del(`pos:${req.auth!.userId}`);
    await audit(req, "tour.return", "tour", id, { depotId: t.depotId, before: t, after: { ...after, check: body } });
    await publish({ type: "tours.changed", depotId: t.depotId, tourId: id });
    return after;
  });
}
