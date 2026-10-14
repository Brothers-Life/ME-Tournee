import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { createDb } from "@me/db";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:8081").split(",").map((s) => s.trim()),
  sessionHoursPanel: Number(process.env.SESSION_HOURS_PANEL ?? 12),
  sessionHoursDriver: Number(process.env.SESSION_HOURS_DRIVER ?? 16),
  maxPinAttempts: Number(process.env.MAX_PIN_ATTEMPTS ?? 5),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
};

export const { db, client: pg } = createDb();
export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
export const importQueue = new Queue("imports", { connection: redis });

export type AppEvent =
  | { type: "imports.changed"; depotId: string }
  | { type: "tours.changed"; depotId: string; tourId?: string }
  | { type: "deliveries.changed"; depotId: string; tourId?: string | null }
  | { type: "incidents.changed"; depotId: string }
  | { type: "positions.changed"; depotId: string; userId: string; lat: number; lng: number; at: string; tourId?: string | null }
  | { type: "vehicle_check.anomaly"; depotId: string; tourId: string };

/** Diffuse un évènement aux panels connectés (via Redis, pour plusieurs instances d'API). */
export function publish(event: AppEvent) {
  return redis.publish("events", JSON.stringify(event));
}
