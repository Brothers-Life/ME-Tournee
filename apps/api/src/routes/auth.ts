import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { generateSecret, generateURI, verify } from "otplib";
import { loginPasswordSchema, loginPinSchema, can, ALL_PERMISSIONS } from "@me/shared";
import { and, eq, inArray, asc, users, depots, userRoles, roles } from "@me/db";
import { db, redis, config } from "../context.js";
import { parse, badRequest, unauthorized, forbidden, HttpError } from "../lib/http.js";
import { createSession, destroySession, destroyUserSessions, effectivePermissions, requireAuth } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

const pinSchema = z.string().regex(/^\d{4,6}$/, "4 à 6 chiffres");

export async function authRoutes(app: FastifyInstance) {
  // Connexion panel : email + mot de passe (+ code de double authentification s'il est activé).
  app.post("/auth/login", async (req) => {
    const body = parse(loginPasswordSchema, req.body);
    const email = body.email.toLowerCase();
    const rlKey = `rl:login:${email}`;
    const tries = await redis.incr(rlKey);
    if (tries === 1) await redis.expire(rlKey, 15 * 60);
    if (tries > 10) throw new HttpError(429, "Trop de tentatives, réessayez dans 15 minutes", "rate_limited");

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !user.isActive || !user.passwordHash || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw unauthorized("Email ou mot de passe incorrect", "bad_credentials");
    }
    if (user.totpEnabled) {
      if (!body.totp) return { needTotp: true };
      const ok = await verify({ secret: user.totpSecret!, token: body.totp, epochTolerance: 30 });
      if (!ok.valid) throw unauthorized("Code de double authentification incorrect", "bad_totp");
    }
    await redis.del(rlKey);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const token = await createSession(user.id, "panel");
    req.auth = { userId: user.id, kind: "panel", createdAt: "", token, perms: {} };
    await audit(req, "auth.login", "user", user.id);
    return { token };
  });

  // Liste des chauffeurs d'un dépôt pour l'écran de connexion de l'app (nom + identifiant).
  app.get("/auth/drivers", async (req) => {
    const { depot } = parse(z.object({ depot: z.string().min(1) }), req.query);
    const [d] = await db.select().from(depots).where(eq(depots.code, depot.toUpperCase()));
    if (!d) return [];
    const rows = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, login: users.login, permissions: roles.permissions })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.depotId, d.id), eq(users.isActive, true)))
      .orderBy(asc(users.firstName));
    const seen = new Set<string>();
    return rows
      .filter((r) => r.login && r.permissions.includes("driver.app") && !seen.has(r.id) && seen.add(r.id))
      .map((r) => ({ login: r.login, name: `${r.firstName} ${r.lastName.charAt(0)}.` }));
  });

  // Connexion chauffeur : identifiant + PIN. Blocage après N erreurs, déblocage par un responsable.
  app.post("/auth/driver-login", async (req) => {
    const body = parse(loginPinSchema, req.body);
    const [user] = await db.select().from(users).where(eq(users.login, body.login.toUpperCase()));
    if (!user || !user.isActive || !user.driverPinHash) throw unauthorized("Identifiant ou PIN incorrect", "bad_credentials");
    if (user.lockedAt) throw forbidden("Compte bloqué après trop d'erreurs : demandez à votre responsable de le débloquer", "locked");
    if (!(await bcrypt.compare(body.pin, user.driverPinHash))) {
      const failed = user.failedAttempts + 1;
      const locked = failed >= config.maxPinAttempts;
      await db.update(users).set({ failedAttempts: failed, lockedAt: locked ? new Date() : null }).where(eq(users.id, user.id));
      if (locked) throw forbidden("Compte bloqué après trop d'erreurs : demandez à votre responsable de le débloquer", "locked");
      throw unauthorized(`PIN incorrect (${config.maxPinAttempts - failed} essai(s) restant(s))`, "bad_credentials");
    }
    const perms = await effectivePermissions(user.id);
    if (!can(perms, "driver.app")) throw forbidden("Ce compte n'a pas accès à l'app chauffeur");
    await db.update(users).set({ failedAttempts: 0, lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const token = await createSession(user.id, "driver");
    req.auth = { userId: user.id, kind: "driver", createdAt: "", token, perms };
    await audit(req, "auth.driver_login", "user", user.id);
    return { token, mustChangePin: user.mustChangePin };
  });

  app.post("/auth/logout", async (req) => {
    if (req.auth) await destroySession(req.auth.token);
    return { ok: true };
  });

  // Déverrouillage rapide du panel après inactivité.
  app.post("/auth/unlock", async (req) => {
    const auth = requireAuth(req);
    const { pin } = parse(z.object({ pin: z.string() }), req.body);
    const key = `rl:unlock:${auth.userId}`;
    const tries = await redis.incr(key);
    if (tries === 1) await redis.expire(key, 15 * 60);
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (tries > config.maxPinAttempts) {
      await destroySession(auth.token);
      throw unauthorized("Trop d'erreurs de PIN : reconnectez-vous", "unauthorized");
    }
    if (!u?.panelPinHash || !(await bcrypt.compare(pin, u.panelPinHash))) throw forbidden("Code PIN incorrect", "pin_invalid");
    await redis.del(key);
    return { ok: true };
  });

  app.get("/me", async (req) => {
    const auth = requireAuth(req);
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!u || !u.isActive) throw unauthorized();
    const depotIds = Object.keys(auth.perms).filter((k) => k !== "*");
    const allDepots = auth.perms["*"]?.length
      ? await db.select().from(depots).where(eq(depots.isActive, true)).orderBy(asc(depots.name))
      : depotIds.length
        ? await db.select().from(depots).where(inArray(depots.id, depotIds)).orderBy(asc(depots.name))
        : [];
    return {
      user: {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        login: u.login,
        totpEnabled: u.totpEnabled,
        hasPanelPin: !!u.panelPinHash,
        mustChangePin: u.mustChangePin,
      },
      kind: auth.kind,
      permissions: auth.perms,
      depots: allDepots.map((d) => ({ id: d.id, code: d.code, name: d.name, settings: d.settings })),
      allPermissions: ALL_PERMISSIONS,
    };
  });

  // Changement du PIN chauffeur (obligatoire à la première connexion).
  app.post("/me/driver-pin", async (req) => {
    const auth = requireAuth(req);
    const body = parse(z.object({ currentPin: z.string(), newPin: pinSchema }), req.body);
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!u?.driverPinHash || !(await bcrypt.compare(body.currentPin, u.driverPinHash))) throw badRequest("PIN actuel incorrect");
    if (body.currentPin === body.newPin) throw badRequest("Choisissez un PIN différent de l'actuel");
    await db.update(users).set({ driverPinHash: await bcrypt.hash(body.newPin, 10), mustChangePin: false }).where(eq(users.id, u.id));
    await audit(req, "user.driver_pin_changed", "user", u.id);
    return { ok: true };
  });

  // PIN perso du panel (déverrouillage + confirmation des actions sensibles).
  app.post("/me/panel-pin", async (req) => {
    const auth = requireAuth(req);
    const body = parse(z.object({ password: z.string(), newPin: pinSchema }), req.body);
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!u?.passwordHash || !(await bcrypt.compare(body.password, u.passwordHash))) throw badRequest("Mot de passe incorrect");
    await db.update(users).set({ panelPinHash: await bcrypt.hash(body.newPin, 10), mustChangePin: false }).where(eq(users.id, u.id));
    await audit(req, "user.panel_pin_changed", "user", u.id);
    return { ok: true };
  });

  app.post("/me/password", async (req) => {
    const auth = requireAuth(req);
    const body = parse(z.object({ current: z.string(), next: z.string().min(10, "10 caractères minimum") }), req.body);
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!u?.passwordHash || !(await bcrypt.compare(body.current, u.passwordHash))) throw badRequest("Mot de passe actuel incorrect");
    await db.update(users).set({ passwordHash: await bcrypt.hash(body.next, 12) }).where(eq(users.id, u.id));
    await destroyUserSessions(u.id);
    await audit(req, "user.password_changed", "user", u.id);
    return { ok: true };
  });

  // Double authentification (optionnelle).
  app.post("/me/totp/setup", async (req) => {
    const auth = requireAuth(req);
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId));
    const secret = generateSecret();
    await redis.set(`totp-setup:${auth.userId}`, secret, "EX", 600);
    return { secret, uri: generateURI({ issuer: "ME Tournée", label: u!.email ?? u!.login ?? u!.id, secret }) };
  });

  app.post("/me/totp/enable", async (req) => {
    const auth = requireAuth(req);
    const { token } = parse(z.object({ token: z.string() }), req.body);
    const secret = await redis.get(`totp-setup:${auth.userId}`);
    if (!secret) throw badRequest("Configuration expirée, recommencez");
    const ok = await verify({ secret, token, epochTolerance: 30 });
    if (!ok.valid) throw badRequest("Code incorrect");
    await db.update(users).set({ totpSecret: secret, totpEnabled: true }).where(eq(users.id, auth.userId));
    await redis.del(`totp-setup:${auth.userId}`);
    await audit(req, "user.totp_enabled", "user", auth.userId);
    return { ok: true };
  });

  app.post("/me/totp/disable", async (req) => {
    const auth = requireAuth(req);
    const { password } = parse(z.object({ password: z.string() }), req.body);
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!u?.passwordHash || !(await bcrypt.compare(password, u.passwordHash))) throw badRequest("Mot de passe incorrect");
    await db.update(users).set({ totpSecret: null, totpEnabled: false }).where(eq(users.id, u.id));
    await audit(req, "user.totp_disabled", "user", u.id);
    return { ok: true };
  });
}
