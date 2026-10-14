import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyRequest } from "fastify";
import { can, depotsWith, type EffectivePermissions, type Permission } from "@me/shared";
import { eq, users, userRoles, roles, userPermissionOverrides } from "@me/db";
import { db, redis, config } from "../context.js";
import { forbidden, unauthorized } from "./http.js";

export interface Session {
  userId: string;
  kind: "panel" | "driver";
  createdAt: string;
}

export interface AuthContext extends Session {
  token: string;
  perms: EffectivePermissions;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

const SESSION_PREFIX = "sess:";
const PERM_PREFIX = "perm:";

export async function createSession(userId: string, kind: Session["kind"]): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const hours = kind === "panel" ? config.sessionHoursPanel : config.sessionHoursDriver;
  const session: Session = { userId, kind, createdAt: new Date().toISOString() };
  await redis.set(SESSION_PREFIX + token, JSON.stringify(session), "EX", hours * 3600);
  await redis.sadd(`user-sessions:${userId}`, token);
  return token;
}

export async function destroySession(token: string) {
  const raw = await redis.get(SESSION_PREFIX + token);
  if (raw) await redis.srem(`user-sessions:${(JSON.parse(raw) as Session).userId}`, token);
  await redis.del(SESSION_PREFIX + token);
}

/** Coupe toutes les sessions d'un utilisateur (désactivation, changement de mot de passe). */
export async function destroyUserSessions(userId: string) {
  const tokens = await redis.smembers(`user-sessions:${userId}`);
  if (tokens.length) await redis.del(...tokens.map((t) => SESSION_PREFIX + t));
  await redis.del(`user-sessions:${userId}`);
}

/** Calcule les droits effectifs : rôles × dépôts, puis exceptions par utilisateur. Mis en cache 5 min. */
export async function effectivePermissions(userId: string): Promise<EffectivePermissions> {
  const cached = await redis.get(PERM_PREFIX + userId);
  if (cached) return JSON.parse(cached) as EffectivePermissions;
  const rows = await db
    .select({ depotId: userRoles.depotId, permissions: roles.permissions })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  const map: Record<string, Set<string>> = {};
  for (const r of rows) {
    const key = r.depotId ?? "*";
    map[key] ??= new Set();
    for (const p of r.permissions) map[key].add(p);
  }
  const overrides = await db.select().from(userPermissionOverrides).where(eq(userPermissionOverrides.userId, userId));
  for (const o of overrides) {
    const key = o.depotId ?? "*";
    map[key] ??= new Set();
    if (o.effect === "grant") map[key].add(o.permission);
    else {
      map[key].delete(o.permission);
      // Un retrait global retire aussi la permission dans chaque dépôt.
      if (key === "*") for (const set of Object.values(map)) set.delete(o.permission);
    }
  }
  const eff: EffectivePermissions = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v] as Permission[]]));
  await redis.set(PERM_PREFIX + userId, JSON.stringify(eff), "EX", 300);
  return eff;
}

export async function invalidatePermissions(userId?: string) {
  if (userId) {
    await redis.del(PERM_PREFIX + userId);
    return;
  }
  const keys = await redis.keys(PERM_PREFIX + "*");
  if (keys.length) await redis.del(...keys);
}

/** Hook : lit le jeton « Authorization: Bearer ... » et charge la session. */
export async function loadAuth(req: FastifyRequest) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : (req.query as { token?: string } | undefined)?.token;
  if (!token) return;
  const raw = await redis.get(SESSION_PREFIX + token);
  if (!raw) return;
  const session = JSON.parse(raw) as Session;
  req.auth = { ...session, token, perms: await effectivePermissions(session.userId) };
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** Vérifie une permission ; avec depotId, dans ce dépôt précis. */
export function requirePerm(req: FastifyRequest, perm: Permission, depotId?: string | null): AuthContext {
  const auth = requireAuth(req);
  if (!can(auth.perms, perm, depotId)) throw forbidden();
  return auth;
}

/** Dépôts visibles pour une permission ; null = tous. Lève 403 si aucun. */
export function scopeFor(req: FastifyRequest, perm: Permission): string[] | null {
  const auth = requireAuth(req);
  const scope = depotsWith(auth.perms, perm);
  if (scope && scope.length === 0) throw forbidden();
  return scope;
}

/** Confirmation par PIN perso (en-tête X-Pin) pour les actions sensibles du panel. */
export async function requirePin(req: FastifyRequest) {
  const auth = requireAuth(req);
  const pin = req.headers["x-pin"];
  if (typeof pin !== "string" || !pin) throw forbidden("Code PIN requis pour cette action", "pin_required");
  const [u] = await db.select({ panelPinHash: users.panelPinHash }).from(users).where(eq(users.id, auth.userId));
  if (!u?.panelPinHash || !(await bcrypt.compare(pin, u.panelPinHash))) throw forbidden("Code PIN incorrect", "pin_invalid");
}
