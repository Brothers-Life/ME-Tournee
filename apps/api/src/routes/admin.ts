// Référentiels du panel : dépôts, utilisateurs, rôles, véhicules, secteurs, clients, réglages.
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ALL_PERMISSIONS, depotSettingsSchema, DEFAULT_DEPOT_SETTINGS, VEHICLE_TYPES, type Permission } from "@me/shared";
import {
  and, asc, desc, eq, ilike, inArray, isNull, or, sql,
  depots, users, roles, userRoles, userPermissionOverrides, vehicles, sectors, clients, smsTemplates, incidentTypes, auditLogs,
} from "@me/db";
import { db } from "../context.js";
import { parse, badRequest, notFound, forbidden } from "../lib/http.js";
import { requirePerm, scopeFor, requirePin, invalidatePermissions, destroyUserSessions, requireAuth } from "../lib/auth.js";
import { audit, redact } from "../lib/audit.js";

const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });
const permEnum = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]);

function inScope(scope: string[] | null, depotId: string | null) {
  return scope === null || (depotId !== null && scope.includes(depotId));
}

export async function adminRoutes(app: FastifyInstance) {
  // ---------- Dépôts ----------
  app.get("/depots", async (req) => {
    requireAuth(req);
    const scope = scopeFor(req, "dashboard.view");
    const rows = await db.select().from(depots).orderBy(asc(depots.name));
    return rows.filter((d) => inScope(scope, d.id));
  });

  app.post("/depots", async (req) => {
    requirePerm(req, "depots.manage", null);
    if (!req.auth!.perms["*"]?.includes("depots.manage")) throw forbidden("Seul un administrateur global peut créer un dépôt");
    const body = parse(z.object({ code: z.string().min(2).max(20), name: z.string().min(2), address: z.string().nullable().optional() }), req.body);
    const [d] = await db
      .insert(depots)
      .values({ code: body.code.toUpperCase(), name: body.name, address: body.address ?? null, settings: DEFAULT_DEPOT_SETTINGS })
      .returning();
    await audit(req, "depot.create", "depot", d!.id, { depotId: d!.id, after: d });
    return d;
  });

  app.patch("/depots/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    requirePerm(req, "depots.manage", id);
    const body = parse(
      z.object({ name: z.string().min(2).optional(), address: z.string().nullable().optional(), isActive: z.boolean().optional(), settings: depotSettingsSchema.partial().optional() }),
      req.body,
    );
    const [before] = await db.select().from(depots).where(eq(depots.id, id));
    if (!before) throw notFound();
    const settings = body.settings ? depotSettingsSchema.parse({ ...before.settings, ...body.settings }) : before.settings;
    const [after] = await db
      .update(depots)
      .set({ name: body.name ?? before.name, address: body.address === undefined ? before.address : body.address, isActive: body.isActive ?? before.isActive, settings })
      .where(eq(depots.id, id))
      .returning();
    await audit(req, "depot.update", "depot", id, { depotId: id, before, after });
    return after;
  });

  // ---------- Rôles ----------
  app.get("/roles", async (req) => {
    requireAuth(req);
    return db.select().from(roles).orderBy(desc(roles.isSystem), asc(roles.name));
  });

  const roleBody = z.object({ name: z.string().min(2), description: z.string().nullable().optional(), permissions: z.array(permEnum) });

  app.post("/roles", async (req) => {
    requirePerm(req, "roles.manage");
    await requirePin(req);
    const body = parse(roleBody, req.body);
    const [r] = await db.insert(roles).values({ name: body.name, description: body.description ?? null, permissions: body.permissions }).returning();
    await audit(req, "role.create", "role", r!.id, { after: r });
    return r;
  });

  app.patch("/roles/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    requirePerm(req, "roles.manage");
    await requirePin(req);
    const body = parse(roleBody.partial(), req.body);
    const [before] = await db.select().from(roles).where(eq(roles.id, id));
    if (!before) throw notFound();
    if (before.key === "super_admin" && body.permissions) throw badRequest("Les droits du super admin ne sont pas modifiables");
    const [after] = await db
      .update(roles)
      .set({ name: body.name ?? before.name, description: body.description === undefined ? before.description : body.description, permissions: body.permissions ?? before.permissions })
      .where(eq(roles.id, id))
      .returning();
    await invalidatePermissions();
    await audit(req, "role.update", "role", id, { before, after });
    return after;
  });

  app.delete("/roles/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    requirePerm(req, "roles.manage");
    await requirePin(req);
    const [before] = await db.select().from(roles).where(eq(roles.id, id));
    if (!before) throw notFound();
    if (before.isSystem) throw badRequest("Un rôle par défaut ne peut pas être supprimé");
    await db.delete(roles).where(eq(roles.id, id));
    await invalidatePermissions();
    await audit(req, "role.delete", "role", id, { before });
    return { ok: true };
  });

  // ---------- Utilisateurs ----------
  async function loadAssignments(userIds: string[]) {
    if (!userIds.length) return [];
    return db
      .select({ id: userRoles.id, userId: userRoles.userId, roleId: userRoles.roleId, depotId: userRoles.depotId, roleName: roles.name, roleKey: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, userIds));
  }

  const publicUser = (u: typeof users.$inferSelect) => ({
    id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, login: u.login,
    isActive: u.isActive, locked: !!u.lockedAt, totpEnabled: u.totpEnabled, hasPassword: !!u.passwordHash,
    hasDriverPin: !!u.driverPinHash, roundingOffset: u.roundingOffset, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
  });

  app.get("/users", async (req) => {
    const scope = scopeFor(req, "users.view");
    const q = parse(z.object({ depotId: uuid.optional(), search: z.string().optional(), role: z.string().optional() }), req.query);
    let rows = await db.select().from(users).where(isNull(users.anonymizedAt)).orderBy(asc(users.lastName), asc(users.firstName));
    if (q.search) {
      const s = q.search.toLowerCase();
      rows = rows.filter((u) => `${u.firstName} ${u.lastName} ${u.email ?? ""} ${u.login ?? ""}`.toLowerCase().includes(s));
    }
    const assignments = await loadAssignments(rows.map((u) => u.id));
    return rows
      .map((u) => ({ ...publicUser(u), assignments: assignments.filter((a) => a.userId === u.id) }))
      .filter((u) => {
        const depotIds = u.assignments.map((a) => a.depotId);
        if (q.depotId && !depotIds.includes(q.depotId) && !depotIds.includes(null)) return false;
        if (q.role && !u.assignments.some((a) => a.roleKey === q.role)) return false;
        // Hors périmètre global, on ne voit que les personnes rattachées à un de ses dépôts.
        return scope === null || depotIds.some((d) => d !== null && scope.includes(d));
      });
  });

  const userBody = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().nullable().optional(),
    phone: z.string().nullable().optional(),
    login: z.string().min(2).max(20).nullable().optional(),
    password: z.string().min(10).nullable().optional(),
    driverPin: z.string().regex(/^\d{4,6}$/).nullable().optional(),
    panelPin: z.string().regex(/^\d{4,6}$/).nullable().optional(),
    assignments: z.array(z.object({ roleId: uuid, depotId: uuid.nullable() })).default([]),
  });

  /** Un utilisateur non global ne peut affecter des rôles que dans ses dépôts, et jamais en global. */
  function checkAssignable(req: Parameters<typeof scopeFor>[0], assignments: { depotId: string | null }[]) {
    const scope = scopeFor(req, "users.manage");
    for (const a of assignments) {
      if (!inScope(scope, a.depotId)) throw forbidden("Vous ne pouvez affecter des rôles que dans vos dépôts");
    }
  }

  app.post("/users", async (req) => {
    requirePerm(req, "users.manage");
    await requirePin(req);
    const body = parse(userBody, req.body);
    checkAssignable(req, body.assignments);
    const [u] = await db
      .insert(users)
      .values({
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email?.toLowerCase() ?? null,
        phone: body.phone ?? null,
        login: body.login?.toUpperCase() ?? null,
        passwordHash: body.password ? await bcrypt.hash(body.password, 12) : null,
        driverPinHash: body.driverPin ? await bcrypt.hash(body.driverPin, 10) : null,
        panelPinHash: body.panelPin ? await bcrypt.hash(body.panelPin, 10) : null,
        mustChangePin: true,
      })
      .returning()
      .catch((e: { code?: string }) => {
        if (e.code === "23505") throw badRequest("Cet email ou cet identifiant est déjà utilisé");
        throw e;
      });
    if (body.assignments.length) await db.insert(userRoles).values(body.assignments.map((a) => ({ userId: u!.id, ...a })));
    await audit(req, "user.create", "user", u!.id, { after: { ...redact(u), assignments: body.assignments } });
    return publicUser(u!);
  });

  app.patch("/users/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    requirePerm(req, "users.manage");
    await requirePin(req);
    const body = parse(userBody.partial().extend({ isActive: z.boolean().optional(), unlock: z.boolean().optional() }), req.body);
    const [before] = await db.select().from(users).where(eq(users.id, id));
    if (!before) throw notFound();
    const beforeAssign = await loadAssignments([id]);
    checkAssignable(req, beforeAssign);
    if (body.assignments) checkAssignable(req, body.assignments);
    const patch: Partial<typeof users.$inferInsert> = {};
    if (body.firstName) patch.firstName = body.firstName;
    if (body.lastName) patch.lastName = body.lastName;
    if (body.email !== undefined) patch.email = body.email?.toLowerCase() ?? null;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.login !== undefined) patch.login = body.login?.toUpperCase() ?? null;
    if (body.password) patch.passwordHash = await bcrypt.hash(body.password, 12);
    if (body.driverPin) Object.assign(patch, { driverPinHash: await bcrypt.hash(body.driverPin, 10), mustChangePin: true, failedAttempts: 0, lockedAt: null });
    if (body.panelPin) patch.panelPinHash = await bcrypt.hash(body.panelPin, 10);
    if (body.unlock) Object.assign(patch, { failedAttempts: 0, lockedAt: null });
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    const [after] = Object.keys(patch).length
      ? await db.update(users).set(patch).where(eq(users.id, id)).returning().catch((e: { code?: string }) => {
          if (e.code === "23505") throw badRequest("Cet email ou cet identifiant est déjà utilisé");
          throw e;
        })
      : [before];
    if (body.assignments) {
      await db.delete(userRoles).where(eq(userRoles.userId, id));
      if (body.assignments.length) await db.insert(userRoles).values(body.assignments.map((a) => ({ userId: id, ...a })));
      await invalidatePermissions(id);
    }
    if (body.isActive === false || body.password) await destroyUserSessions(id);
    await audit(req, "user.update", "user", id, {
      before: { ...redact(before), assignments: beforeAssign },
      after: { ...redact(after), assignments: body.assignments ?? beforeAssign },
    });
    return publicUser(after!);
  });

  app.get("/users/:id/overrides", async (req) => {
    const { id } = parse(idParam, req.params);
    requirePerm(req, "users.view");
    return db.select().from(userPermissionOverrides).where(eq(userPermissionOverrides.userId, id));
  });

  app.put("/users/:id/overrides", async (req) => {
    const { id } = parse(idParam, req.params);
    requirePerm(req, "roles.manage");
    await requirePin(req);
    const body = parse(z.array(z.object({ permission: permEnum, depotId: uuid.nullable(), effect: z.enum(["grant", "deny"]) })), req.body);
    const before = await db.select().from(userPermissionOverrides).where(eq(userPermissionOverrides.userId, id));
    await db.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, id));
    if (body.length) await db.insert(userPermissionOverrides).values(body.map((o) => ({ ...o, userId: id })));
    await invalidatePermissions(id);
    await audit(req, "user.overrides", "user", id, { before, after: body });
    return { ok: true };
  });

  // ---------- Véhicules ----------
  app.get("/vehicles", async (req) => {
    const scope = scopeFor(req, "vehicles.view");
    const q = parse(z.object({ depotId: uuid.optional() }), req.query);
    const rows = await db.select().from(vehicles).orderBy(asc(vehicles.fleetNumber), asc(vehicles.plate));
    return rows.filter((v) => inScope(scope, v.depotId) && (!q.depotId || v.depotId === q.depotId));
  });

  const vehicleBody = z.object({
    depotId: uuid,
    plate: z.string().min(2).transform((s) => s.toUpperCase().trim()),
    fleetNumber: z.string().nullable().optional(),
    type: z.enum(VEHICLE_TYPES),
    label: z.string().nullable().optional(),
    capacityKg: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
  });

  app.post("/vehicles", async (req) => {
    const body = parse(vehicleBody, req.body);
    requirePerm(req, "vehicles.manage", body.depotId);
    const [v] = await db.insert(vehicles).values(body).returning().catch((e: { code?: string }) => {
      if (e.code === "23505") throw badRequest("Cette plaque existe déjà");
      throw e;
    });
    await audit(req, "vehicle.create", "vehicle", v!.id, { depotId: v!.depotId, after: v });
    return v;
  });

  app.patch("/vehicles/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const [before] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    if (!before) throw notFound();
    requirePerm(req, "vehicles.manage", before.depotId);
    const body = parse(vehicleBody.partial(), req.body);
    if (body.depotId) requirePerm(req, "vehicles.manage", body.depotId);
    const [after] = await db.update(vehicles).set(body).where(eq(vehicles.id, id)).returning();
    await audit(req, "vehicle.update", "vehicle", id, { depotId: before.depotId, before, after });
    return after;
  });

  // ---------- Secteurs ----------
  app.get("/sectors", async (req) => {
    const scope = scopeFor(req, "tours.view");
    const q = parse(z.object({ depotId: uuid.optional() }), req.query);
    const rows = await db.select().from(sectors).orderBy(asc(sectors.sortOrder), asc(sectors.name));
    return rows.filter((s) => inScope(scope, s.depotId) && (!q.depotId || s.depotId === q.depotId));
  });

  const sectorBody = z.object({
    depotId: uuid,
    name: z.string().min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    postalCodes: z.array(z.string().regex(/^\d{2,5}$/, "code postal ou préfixe (2 à 5 chiffres)")).default([]),
    cities: z.array(z.string()).default([]),
    defaultDriverId: uuid.nullable().optional(),
    defaultVehicleId: uuid.nullable().optional(),
    sortOrder: z.number().int().optional(),
  });

  app.post("/sectors", async (req) => {
    const body = parse(sectorBody, req.body);
    requirePerm(req, "sectors.manage", body.depotId);
    const [s] = await db.insert(sectors).values(body).returning();
    await audit(req, "sector.create", "sector", s!.id, { depotId: s!.depotId, after: s });
    return s;
  });

  app.patch("/sectors/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const [before] = await db.select().from(sectors).where(eq(sectors.id, id));
    if (!before) throw notFound();
    requirePerm(req, "sectors.manage", before.depotId);
    const body = parse(sectorBody.partial().omit({ depotId: true }), req.body);
    const [after] = await db.update(sectors).set(body).where(eq(sectors.id, id)).returning();
    await audit(req, "sector.update", "sector", id, { depotId: before.depotId, before, after });
    return after;
  });

  app.delete("/sectors/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    const [before] = await db.select().from(sectors).where(eq(sectors.id, id));
    if (!before) throw notFound();
    requirePerm(req, "sectors.manage", before.depotId);
    await db.delete(sectors).where(eq(sectors.id, id));
    await audit(req, "sector.delete", "sector", id, { depotId: before.depotId, before });
    return { ok: true };
  });

  // ---------- Clients ----------
  app.get("/clients", async (req) => {
    requirePerm(req, "clients.view");
    const q = parse(z.object({ search: z.string().optional(), sectorId: uuid.optional(), limit: z.coerce.number().int().max(500).default(200) }), req.query);
    const showContacts = req.auth!.perms && Object.values(req.auth!.perms).some((p) => p.includes("clients.contacts"));
    const where = [];
    if (q.search) where.push(or(ilike(clients.name, `%${q.search}%`), ilike(clients.code, `%${q.search}%`), ilike(clients.city, `%${q.search}%`)));
    if (q.sectorId) where.push(eq(clients.sectorId, q.sectorId));
    const rows = await db.select().from(clients).where(where.length ? and(...where) : undefined).orderBy(asc(clients.name)).limit(q.limit);
    return rows.map((c) => (showContacts ? c : { ...c, phones: [], email: null }));
  });

  app.patch("/clients/:id", async (req) => {
    const { id } = parse(idParam, req.params);
    requirePerm(req, "clients.manage");
    const body = parse(
      z.object({
        sectorId: uuid.nullable().optional(),
        email: z.string().email().nullable().optional(),
        emailSignedBl: z.boolean().optional(),
        phones: z.array(z.string().regex(/^\d{10}$/)).optional(),
        notes: z.string().nullable().optional(),
      }),
      req.body,
    );
    const [before] = await db.select().from(clients).where(eq(clients.id, id));
    if (!before) throw notFound();
    const [after] = await db.update(clients).set({ ...body, updatedAt: new Date() }).where(eq(clients.id, id)).returning();
    await audit(req, "client.update", "client", id, { before, after });
    return after;
  });

  // ---------- Réglages : SMS prédéfinis et types d'incident ----------
  app.get("/sms-templates", async (req) => {
    requireAuth(req);
    const q = parse(z.object({ depotId: uuid.optional() }), req.query);
    return db
      .select()
      .from(smsTemplates)
      .where(q.depotId ? or(isNull(smsTemplates.depotId), eq(smsTemplates.depotId, q.depotId)) : undefined)
      .orderBy(asc(smsTemplates.sortOrder));
  });

  app.put("/sms-templates", async (req) => {
    const body = parse(z.object({ depotId: uuid.nullable(), templates: z.array(z.object({ label: z.string().min(1), body: z.string().min(1).max(480) })) }), req.body);
    requirePerm(req, "settings.manage", body.depotId);
    if (body.depotId === null && !req.auth!.perms["*"]?.includes("settings.manage")) throw forbidden();
    const cond = body.depotId ? eq(smsTemplates.depotId, body.depotId) : isNull(smsTemplates.depotId);
    const before = await db.select().from(smsTemplates).where(cond);
    await db.delete(smsTemplates).where(cond);
    if (body.templates.length) await db.insert(smsTemplates).values(body.templates.map((t, i) => ({ ...t, depotId: body.depotId, sortOrder: i })));
    await audit(req, "settings.sms_templates", "sms_templates", body.depotId, { depotId: body.depotId, before, after: body.templates });
    return { ok: true };
  });

  app.get("/incident-types", async (req) => {
    requireAuth(req);
    return db.select().from(incidentTypes).orderBy(asc(incidentTypes.sortOrder));
  });

  app.put("/incident-types", async (req) => {
    requirePerm(req, "settings.manage");
    const body = parse(z.array(z.object({ key: z.string().regex(/^[a-z0-9_]+$/), label: z.string().min(1), actions: z.array(z.string()), isActive: z.boolean().default(true) })), req.body);
    const before = await db.select().from(incidentTypes);
    for (const [i, t] of body.entries()) {
      await db
        .insert(incidentTypes)
        .values({ ...t, sortOrder: i })
        .onConflictDoUpdate({ target: incidentTypes.key, set: { label: t.label, actions: t.actions, isActive: t.isActive, sortOrder: i } });
    }
    await audit(req, "settings.incident_types", "incident_types", null, { before, after: body });
    return { ok: true };
  });

  // ---------- Journal d'audit ----------
  app.get("/audit", async (req) => {
    const scope = scopeFor(req, "audit.view");
    const q = parse(
      z.object({ entity: z.string().optional(), userId: uuid.optional(), entityId: z.string().optional(), limit: z.coerce.number().int().max(500).default(100), before: z.string().optional() }),
      req.query,
    );
    const where = [];
    if (q.entity) where.push(eq(auditLogs.entity, q.entity));
    if (q.userId) where.push(eq(auditLogs.userId, q.userId));
    if (q.entityId) where.push(eq(auditLogs.entityId, q.entityId));
    if (q.before) where.push(sql`${auditLogs.createdAt} < ${new Date(q.before)}`);
    if (scope) where.push(or(inArray(auditLogs.depotId, scope), isNull(auditLogs.depotId)));
    const rows = await db
      .select({ log: auditLogs, firstName: users.firstName, lastName: users.lastName })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(q.limit);
    return rows.map((r) => ({ ...r.log, userName: r.firstName ? `${r.firstName} ${r.lastName}` : null }));
  });
}
