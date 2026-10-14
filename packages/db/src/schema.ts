import {
  pgTable, uuid, text, boolean, integer, timestamp, jsonb, numeric, date, doublePrecision,
  uniqueIndex, unique, index, customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { DepotSettings } from "@me/shared";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------- Organisation ----------

export const depots = pgTable("depots", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  settings: jsonb("settings").$type<DepotSettings>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").unique(),
  phone: text("phone"),
  /** Identifiant chauffeur (matricule), utilisé avec le PIN dans l'app. */
  login: text("login").unique(),
  passwordHash: text("password_hash"),
  driverPinHash: text("driver_pin_hash"),
  panelPinHash: text("panel_pin_hash"),
  mustChangePin: boolean("must_change_pin").notNull().default(true),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedAt: ts("locked_at"),
  /** Compteur continu d'écart d'arrondi des heures, en minutes (+ = en faveur du salarié). */
  roundingOffset: integer("rounding_offset").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  anonymizedAt: ts("anonymized_at"),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
});

export const roles = pgTable("roles", {
  id: id(),
  key: text("key").unique(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAt(),
});

/** Affectation rôle × dépôt. depotId null = périmètre global. */
export const userRoles = pgTable("user_roles", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  depotId: uuid("depot_id").references(() => depots.id, { onDelete: "cascade" }),
}, (t) => [unique("user_roles_unique").on(t.userId, t.roleId, t.depotId).nullsNotDistinct()]);

/** Exceptions par utilisateur : ajoute ou retire une permission précise. */
export const userPermissionOverrides = pgTable("user_permission_overrides", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
  depotId: uuid("depot_id").references(() => depots.id, { onDelete: "cascade" }),
  effect: text("effect", { enum: ["grant", "deny"] }).notNull(),
});

// ---------- Référentiels ----------

export const sectors = pgTable("sectors", {
  id: id(),
  depotId: uuid("depot_id").notNull().references(() => depots.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#2f6fae"),
  postalCodes: text("postal_codes").array().notNull().default(sql`'{}'::text[]`),
  cities: text("cities").array().notNull().default(sql`'{}'::text[]`),
  defaultDriverId: uuid("default_driver_id").references(() => users.id, { onDelete: "set null" }),
  defaultVehicleId: uuid("default_vehicle_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const vehicles = pgTable("vehicles", {
  id: id(),
  depotId: uuid("depot_id").notNull().references(() => depots.id, { onDelete: "cascade" }),
  plate: text("plate").notNull(),
  fleetNumber: text("fleet_number"),
  type: text("type", { enum: ["VL", "PL"] }).notNull().default("PL"),
  label: text("label"),
  capacityKg: integer("capacity_kg"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("vehicles_plate").on(t.plate)]);

export const clients = pgTable("clients", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  addressLines: text("address_lines").array().notNull().default(sql`'{}'::text[]`),
  postalCode: text("postal_code"),
  city: text("city"),
  phones: text("phones").array().notNull().default(sql`'{}'::text[]`),
  email: text("email"),
  /** Envoi du BL signé par mail au client (désactivé par défaut). */
  emailSignedBl: boolean("email_signed_bl").notNull().default(false),
  sectorId: uuid("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  notes: text("notes"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------- Fichiers (stockés en base : sauvegardés avec elle) ----------

export const files = pgTable("files", {
  id: id(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  kind: text("kind").notNull().default("photo"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// ---------- Imports et BL ----------

export const imports = pgTable("imports", {
  id: id(),
  depotId: uuid("depot_id").notNull().references(() => depots.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
  fileName: text("file_name").notNull(),
  source: text("source", { enum: ["upload", "email"] }).notNull().default("upload"),
  status: text("status", { enum: ["queued", "processing", "done", "failed"] }).notNull().default("queued"),
  blCount: integer("bl_count").notNull().default(0),
  newClients: integer("new_clients").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  error: text("error"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  finishedAt: ts("finished_at"),
});

export const tours = pgTable("tours", {
  id: id(),
  depotId: uuid("depot_id").notNull().references(() => depots.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  name: text("name").notNull(),
  sectorId: uuid("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  driverId: uuid("driver_id").references(() => users.id, { onDelete: "set null" }),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  status: text("status", { enum: ["draft", "validated", "in_progress", "returned", "closed"] }).notNull().default("draft"),
  validatedBy: uuid("validated_by").references(() => users.id, { onDelete: "set null" }),
  validatedAt: ts("validated_at"),
  startedAt: ts("started_at"),
  returnedAt: ts("returned_at"),
  closedAt: ts("closed_at"),
  createdAt: createdAt(),
}, (t) => [index("tours_depot_date").on(t.depotId, t.date)]);

export const deliveryNotes = pgTable("delivery_notes", {
  id: id(),
  depotId: uuid("depot_id").notNull().references(() => depots.id, { onDelete: "cascade" }),
  importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),
  number: text("number").notNull().unique(),
  orderNumber: text("order_number"),
  orderDate: date("order_date"),
  departureAt: ts("departure_at"),
  deliveryDate: date("delivery_date").notNull(),
  carrier: text("carrier"),
  windowStart: text("window_start"),
  windowEnd: text("window_end"),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  clientSnapshot: jsonb("client_snapshot").$type<{ name: string; addressLines: string[]; postalCode: string | null; city: string | null; phones: string[] }>().notNull(),
  packageCount: integer("package_count"),
  netWeightKg: numeric("net_weight_kg", { precision: 10, scale: 3 }),
  comment: text("comment"),
  sourcePage: integer("source_page"),
  tourId: uuid("tour_id").references(() => tours.id, { onDelete: "set null" }),
  sequence: integer("sequence").notNull().default(0),
  status: text("status", { enum: ["pending", "arrived", "delivered", "partial", "failed"] }).notNull().default("pending"),
  arrivedAt: ts("arrived_at"),
  arrivalLat: doublePrecision("arrival_lat"),
  arrivalLng: doublePrecision("arrival_lng"),
  completedAt: ts("completed_at"),
  completedLat: doublePrecision("completed_lat"),
  completedLng: doublePrecision("completed_lng"),
  signerName: text("signer_name"),
  signedBlPhotoId: uuid("signed_bl_photo_id").references(() => files.id, { onDelete: "set null" }),
  temperature: numeric("temperature", { precision: 5, scale: 1 }),
  driverComment: text("driver_comment"),
  /** Reprise demandée dans le commentaire du BL. */
  pickupRequested: boolean("pickup_requested").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("dn_tour").on(t.tourId), index("dn_depot_date").on(t.depotId, t.deliveryDate)]);

export const deliveryLines = pgTable("delivery_lines", {
  id: id(),
  deliveryNoteId: uuid("delivery_note_id").notNull().references(() => deliveryNotes.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  category: text("category").notNull(),
  articleCode: text("article_code").notNull(),
  designation: text("designation").notNull(),
  ean: text("ean"),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: text("unit").notNull(),
  weightKg: numeric("weight_kg", { precision: 10, scale: 3 }),
  lotNumber: text("lot_number"),
  dlc: date("dlc"),
  checkStatus: text("check_status", { enum: ["unchecked", "ok", "issue"] }).notNull().default("unchecked"),
}, (t) => [index("dl_note").on(t.deliveryNoteId)]);

// ---------- Terrain ----------

export const vehicleChecks = pgTable("vehicle_checks", {
  id: id(),
  tourId: uuid("tour_id").notNull().references(() => tours.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
  driverId: uuid("driver_id").notNull().references(() => users.id),
  kind: text("kind", { enum: ["departure", "return"] }).notNull(),
  km: integer("km").notNull(),
  kmPhotoId: uuid("km_photo_id").references(() => files.id, { onDelete: "set null" }),
  clean: boolean("clean"),
  fuelFull: boolean("fuel_full"),
  warningLights: boolean("warning_lights"),
  fridgeOk: boolean("fridge_ok"),
  temperature: numeric("temperature", { precision: 5, scale: 1 }),
  palettes: integer("palettes"),
  comment: text("comment"),
  photoIds: uuid("photo_ids").array().notNull().default(sql`'{}'::uuid[]`),
  hasAnomaly: boolean("has_anomaly").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("vc_tour_kind").on(t.tourId, t.kind)]);

export const incidentTypes = pgTable("incident_types", {
  id: id(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  actions: text("actions").array().notNull().default(sql`'{}'::text[]`),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey(), // généré par l'app (hors-ligne)
  deliveryNoteId: uuid("delivery_note_id").notNull().references(() => deliveryNotes.id, { onDelete: "cascade" }),
  lineId: uuid("line_id").references(() => deliveryLines.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }),
  action: text("action"),
  comment: text("comment"),
  photoIds: uuid("photo_ids").array().notNull().default(sql`'{}'::uuid[]`),
  status: text("status", { enum: ["new", "in_progress", "closed"] }).notNull().default("new"),
  handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
  handledComment: text("handled_comment"),
  handledAt: ts("handled_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("inc_status").on(t.status)]);

export const pickups = pgTable("pickups", {
  id: id(),
  deliveryNoteId: uuid("delivery_note_id").notNull().references(() => deliveryNotes.id, { onDelete: "cascade" }).unique(),
  done: boolean("done").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }),
  comment: text("comment"),
  photoIds: uuid("photo_ids").array().notNull().default(sql`'{}'::uuid[]`),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const communications = pgTable("communications", {
  id: id(),
  deliveryNoteId: uuid("delivery_note_id").references(() => deliveryNotes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["call", "sms"] }).notNull(),
  to: text("to").notNull(),
  body: text("body"),
  createdAt: createdAt(),
});

export const smsTemplates = pgTable("sms_templates", {
  id: id(),
  depotId: uuid("depot_id").references(() => depots.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  body: text("body").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------- Heures ----------

export const timeEntries = pgTable("time_entries", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  depotId: uuid("depot_id").notNull().references(() => depots.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  startAt: ts("start_at").notNull(),
  endAt: ts("end_at"),
  breakMinutes: integer("break_minutes").notNull().default(0),
  breakStartedAt: ts("break_started_at"),
  roundedStart: ts("rounded_start"),
  roundedEnd: ts("rounded_end"),
  offsetAfter: integer("offset_after"),
  correctedBy: uuid("corrected_by").references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("te_user_date").on(t.userId, t.date)]);

// ---------- GPS ----------

export const positions = pgTable("positions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tourId: uuid("tour_id").references(() => tours.id, { onDelete: "set null" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accuracy: doublePrecision("accuracy"),
  recordedAt: ts("recorded_at").notNull(),
}, (t) => [index("pos_user_time").on(t.userId, t.recordedAt)]);

// ---------- Audit ----------

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  depotId: uuid("depot_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  createdAt: createdAt(),
}, (t) => [index("audit_created").on(t.createdAt)]);
