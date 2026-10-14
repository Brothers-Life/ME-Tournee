import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { Redis } from "ioredis";
import { can } from "@me/shared";
import { config, db, pg, redis, type AppEvent } from "./context.js";
import { HttpError } from "./lib/http.js";
import { loadAuth } from "./lib/auth.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { opsRoutes } from "./routes/ops.js";
import { driverRoutes } from "./routes/driver.js";
import { sql } from "@me/db";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true, bodyLimit: 2 * 1024 * 1024 });

await app.register(cors, {
  origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)),
  allowedHeaders: ["Authorization", "Content-Type", "X-Pin"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });
await app.register(websocket);

app.addHook("onRequest", async (req) => {
  await loadAuth(req);
});

app.setErrorHandler((err, req, reply) => {
  if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message, code: err.code });
  const e = err as { statusCode?: number; message: string; code?: string };
  if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.message, code: e.code });
  req.log.error(err);
  return reply.status(500).send({ error: "Erreur interne, réessayez plus tard", code: "internal" });
});

app.get("/health", async () => {
  await db.execute(sql`select 1`);
  await redis.ping();
  return { ok: true, at: new Date().toISOString() };
});

await app.register(authRoutes);
await app.register(adminRoutes);
await app.register(opsRoutes);
await app.register(driverRoutes);

// Temps réel pour le panel : chaque connexion reçoit les évènements des dépôts qu'elle peut voir.
const subscriber = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
const sockets = new Set<{ send: (s: string) => void; perms: Record<string, string[]> }>();
await subscriber.subscribe("events");
subscriber.on("message", (_channel, raw) => {
  const event = JSON.parse(raw) as AppEvent;
  for (const s of sockets) {
    const perm = event.type === "positions.changed" ? "gps.live" : "dashboard.view";
    if (can(s.perms as never, perm, event.depotId)) s.send(raw);
  }
});

app.get("/ws", { websocket: true }, (socket, req) => {
  if (!req.auth || req.auth.kind !== "panel") {
    socket.close(4401, "unauthorized");
    return;
  }
  const entry = { send: (s: string) => socket.send(s), perms: req.auth.perms };
  sockets.add(entry);
  const ping = setInterval(() => socket.ping(), 25_000);
  socket.on("close", () => {
    clearInterval(ping);
    sockets.delete(entry);
  });
});

const shutdown = async () => {
  await app.close();
  await subscriber.quit();
  await redis.quit();
  await pg.end();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: config.port, host: config.host });
