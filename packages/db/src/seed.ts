// Données de départ : rôles système, types d'incident, SMS prédéfinis, super admin.
// Avec SEED_DEMO=1 : un dépôt pilote, ses secteurs, véhicules et chauffeurs de test.
import bcrypt from "bcryptjs";
import { DEFAULT_ROLES, DEFAULT_INCIDENT_TYPES, DEFAULT_SMS_TEMPLATES, DEFAULT_DEPOT_SETTINGS } from "@me/shared";
import { createDb, roles, incidentTypes, smsTemplates, users, userRoles, depots, sectors, vehicles, eq, isNull } from "./index.js";

const { db, client } = createDb();

for (const r of DEFAULT_ROLES) {
  await db
    .insert(roles)
    .values({ key: r.key, name: r.name, description: r.description, permissions: r.permissions, isSystem: true })
    .onConflictDoUpdate({ target: roles.key, set: { permissions: r.permissions, description: r.description } });
}

for (const [i, t] of DEFAULT_INCIDENT_TYPES.entries()) {
  await db.insert(incidentTypes).values({ key: t.key, label: t.label, actions: t.actions, sortOrder: i }).onConflictDoNothing();
}

const existingTemplates = await db.select().from(smsTemplates).where(isNull(smsTemplates.depotId));
if (existingTemplates.length === 0) {
  await db.insert(smsTemplates).values(DEFAULT_SMS_TEMPLATES.map((t, i) => ({ ...t, sortOrder: i })));
}

const superRole = (await db.select().from(roles).where(eq(roles.key, "super_admin")))[0]!;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminEmail && adminPassword) {
  const found = await db.select().from(users).where(eq(users.email, adminEmail));
  if (found.length === 0) {
    const [admin] = await db
      .insert(users)
      .values({
        firstName: process.env.ADMIN_FIRST_NAME ?? "Admin",
        lastName: process.env.ADMIN_LAST_NAME ?? "ME",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        panelPinHash: await bcrypt.hash(process.env.ADMIN_PIN ?? "0000", 10),
        mustChangePin: !process.env.ADMIN_PIN,
      })
      .returning();
    await db.insert(userRoles).values({ userId: admin!.id, roleId: superRole.id, depotId: null });
    console.log(`Super admin créé : ${adminEmail}`);
  }
}

if (process.env.SEED_DEMO === "1") {
  let [depot] = await db.select().from(depots).where(eq(depots.code, "SOFRILOG"));
  if (!depot) {
    [depot] = await db
      .insert(depots)
      .values({ code: "SOFRILOG", name: "Dépôt SOFRILOG (pilote)", address: "Gironde", settings: DEFAULT_DEPOT_SETTINGS })
      .returning();
    await db.insert(sectors).values([
      { depotId: depot!.id, name: "Bassin d'Arcachon", color: "#1c8c99", sortOrder: 0, postalCodes: ["33260", "33280", "33380", "33980", "33510", "33120", "33138", "33470", "33740", "33950", "33970", "33680"] },
      { depotId: depot!.id, name: "Bordeaux Métropole", color: "#2f6fae", sortOrder: 1, postalCodes: ["330", "331", "332", "333", "334", "335", "336", "337", "338"] },
      { depotId: depot!.id, name: "Landes", color: "#b26b00", sortOrder: 2, postalCodes: ["40"] },
    ]);
    await db.insert(vehicles).values([
      { depotId: depot!.id, plate: "GA-123-BC", fleetNumber: "12", type: "PL", label: "Renault D frigo", capacityKg: 3500 },
      { depotId: depot!.id, plate: "GB-456-DE", fleetNumber: "14", type: "PL", label: "Iveco frigo", capacityKg: 3000 },
      { depotId: depot!.id, plate: "FX-789-FG", fleetNumber: "21", type: "VL", label: "Master frigo", capacityKg: 1200 },
    ]);
    const driverRole = (await db.select().from(roles).where(eq(roles.key, "driver")))[0]!;
    const drivers = [
      { firstName: "Karim", lastName: "Durand", login: "CH01" },
      { firstName: "Julien", lastName: "Martin", login: "CH02" },
      { firstName: "Sofia", lastName: "Lopez", login: "CH03" },
    ];
    for (const d of drivers) {
      const [u] = await db
        .insert(users)
        .values({ ...d, driverPinHash: await bcrypt.hash("1234", 10), mustChangePin: false })
        .returning();
      await db.insert(userRoles).values({ userId: u!.id, roleId: driverRole.id, depotId: depot!.id });
    }
    console.log("Données de démo créées (chauffeurs CH01..CH03, PIN 1234)");
  }
}

console.log("Seed terminé");
await client.end();
