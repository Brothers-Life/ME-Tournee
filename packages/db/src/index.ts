import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { schema };
export * from "drizzle-orm";

export function createDb(url = process.env.DATABASE_URL ?? "postgres://me:me@localhost:5432/me_tournee") {
  const client = postgres(url, { max: Number(process.env.DB_POOL ?? 10) });
  return { db: drizzle(client, { schema }), client };
}

export type Db = ReturnType<typeof createDb>["db"];
