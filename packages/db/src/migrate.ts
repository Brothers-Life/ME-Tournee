import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { createDb } from "./index.js";

const folder = fileURLToPath(new URL("../migrations", import.meta.url));
const { db, client } = createDb();
await migrate(db, { migrationsFolder: folder });
console.log("Migrations appliquées");
await client.end();
