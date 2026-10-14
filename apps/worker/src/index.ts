// Tâches de fond : import des PDF de BL et maintenance (purge RGPD).
import { Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { createDb, lt, positions, imports, eq, sql } from "@me/db";
import { processImport } from "@me/core";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const { db, client } = createDb();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

const importWorker = new Worker(
  "imports",
  async (job) => {
    const { importId } = job.data as { importId: string };
    log("import", importId);
    const r = await processImport(db, importId);
    const [imp] = await db.select({ depotId: imports.depotId }).from(imports).where(eq(imports.id, importId));
    if (imp) {
      await connection.publish("events", JSON.stringify({ type: "imports.changed", depotId: imp.depotId }));
      await connection.publish("events", JSON.stringify({ type: "tours.changed", depotId: imp.depotId }));
    }
    log("import terminé", importId, r);
    return r;
  },
  { connection, concurrency: 1 },
);
importWorker.on("failed", async (job, err) => {
  log("import en échec", job?.id, err.message);
  const importId = (job?.data as { importId?: string } | undefined)?.importId;
  if (importId) {
    const [imp] = await db.select({ depotId: imports.depotId }).from(imports).where(eq(imports.id, importId));
    if (imp) await connection.publish("events", JSON.stringify({ type: "imports.changed", depotId: imp.depotId }));
  }
});

// Maintenance quotidienne : effacement de l'historique GPS au-delà de la durée de conservation.
const maintenance = new Queue("maintenance", { connection });
await maintenance.upsertJobScheduler("daily", { pattern: "30 2 * * *", tz: "Europe/Paris" }, { name: "purge" });
const maintenanceWorker = new Worker(
  "maintenance",
  async () => {
    const days = Number(process.env.GPS_RETENTION_DAYS ?? 60);
    const res = await db.delete(positions).where(lt(positions.recordedAt, sql`now() - make_interval(days => ${days})`)).returning({ id: positions.id });
    log(`purge GPS : ${res.length} points supprimés (> ${days} jours)`);
  },
  { connection },
);

log("worker démarré");

const shutdown = async () => {
  await importWorker.close();
  await maintenanceWorker.close();
  await connection.quit();
  await client.end();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
