import { z } from "zod";

// ---------- Référentiels ----------

export const VEHICLE_TYPES = ["VL", "PL"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const TOUR_STATUSES = ["draft", "validated", "in_progress", "returned", "closed"] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];
export const TOUR_STATUS_LABELS: Record<TourStatus, string> = {
  draft: "Brouillon",
  validated: "Validée",
  in_progress: "En tournée",
  returned: "Retour dépôt",
  closed: "Clôturée",
};

export const DELIVERY_STATUSES = ["pending", "arrived", "delivered", "partial", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "À livrer",
  arrived: "Sur place",
  delivered: "Livré",
  partial: "Livré avec incident",
  failed: "Non livré",
};

export const LINE_CHECK_STATUSES = ["unchecked", "ok", "issue"] as const;
export type LineCheckStatus = (typeof LINE_CHECK_STATUSES)[number];

export const INCIDENT_STATUSES = ["new", "in_progress", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  new: "Nouveau",
  in_progress: "Pris en charge",
  closed: "Clôturé",
};

export const DEFAULT_INCIDENT_TYPES: { key: string; label: string; actions: string[] }[] = [
  { key: "missing", label: "Colis manquant", actions: ["À relivrer", "À créditer"] },
  { key: "damaged", label: "Produit cassé ou abîmé", actions: ["Repris", "Laissé au client"] },
  { key: "wrong_product", label: "Mauvais produit", actions: ["Repris", "Laissé au client"] },
  { key: "quantity", label: "Erreur de quantité", actions: ["Repris", "Laissé au client"] },
  { key: "short_dlc", label: "DLC trop courte", actions: ["Repris", "Laissé au client"] },
  { key: "cold_chain", label: "Rupture de froid", actions: ["Repris", "Détruit"] },
  { key: "refused", label: "Refusé par le client", actions: ["Repris"] },
  { key: "closed", label: "Client absent ou fermé", actions: ["Livraison reportée", "Laissé selon consigne"] },
  { key: "other", label: "Autre", actions: ["Repris", "Laissé au client", "Autre"] },
];

export const DEFAULT_SMS_TEMPLATES = [
  { label: "J'arrive", body: "Bonjour, votre livreur Maison Esclaire arrive dans 10 min." },
  { label: "Je suis devant", body: "Bonjour, je suis devant chez vous pour la livraison Maison Esclaire, pouvez-vous m'ouvrir ?" },
  { label: "Pas pu livrer", body: "Bonjour, je n'ai pas pu vous livrer ce matin. Merci de recontacter Maison Esclaire." },
];

// ---------- Réglages par dépôt ----------

export const depotSettingsSchema = z.object({
  palettesEnabled: z.boolean().default(false),
  palettesVehicleTypes: z.array(z.enum(VEHICLE_TYPES)).default(["PL"]),
  temperatureEnabled: z.boolean().default(false),
  temperatureRequired: z.boolean().default(false),
  timeRounding: z.enum(["none", "nearest", "compensated"]).default("compensated"),
  roundingStepMinutes: z.number().int().min(1).max(60).default(15),
  requireSignedBlPhoto: z.boolean().default(true),
  gpsRetentionDays: z.number().int().min(1).max(365).default(60),
});
export type DepotSettings = z.infer<typeof depotSettingsSchema>;
export const DEFAULT_DEPOT_SETTINGS: DepotSettings = depotSettingsSchema.parse({});

// ---------- BL extrait du PDF ----------

export interface ParsedBlLine {
  category: string;
  articleCode: string;
  designation: string;
  ean: string | null;
  quantity: number;
  unit: string;
  weightKg: number | null;
  lotNumber: string | null;
  dlc: string | null; // ISO yyyy-mm-dd
}

export interface ParsedBl {
  number: string;
  pageStart: number;
  orderNumber: string | null;
  orderDate: string | null;
  departureAt: string | null; // ISO
  deliveryDate: string | null; // yyyy-mm-dd
  carrier: string | null;
  windowStart: string | null; // HH:MM
  windowEnd: string | null;
  client: {
    code: string | null;
    name: string;
    addressLines: string[];
    postalCode: string | null;
    city: string | null;
    phones: string[];
  };
  lines: ParsedBlLine[];
  packageCount: number | null;
  netWeightKg: number | null;
  comment: string | null;
}

// ---------- Payloads de l'API ----------

export const loginPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
});

export const loginPinSchema = z.object({
  login: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/),
});

export const departureCheckSchema = z.object({
  vehicleId: z.string().uuid(),
  km: z.number().int().min(0),
  kmPhotoId: z.string().uuid().nullable().optional(),
  clean: z.boolean(),
  fuelFull: z.boolean(),
  warningLights: z.boolean(),
  fridgeOk: z.boolean(),
  temperature: z.number().nullable().optional(),
  palettes: z.number().int().min(0).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  photoIds: z.array(z.string().uuid()).default([]),
});

export const returnCheckSchema = z.object({
  km: z.number().int().min(0),
  kmPhotoId: z.string().uuid().nullable().optional(),
  cleaned: z.boolean(),
  temperature: z.number().nullable().optional(),
  palettes: z.number().int().min(0).nullable().optional(),
  returnsPhotoIds: z.array(z.string().uuid()).default([]),
  comment: z.string().max(2000).nullable().optional(),
});

export const incidentCreateSchema = z.object({
  id: z.string().uuid(),
  lineId: z.string().uuid().nullable().optional(),
  type: z.string().min(1),
  quantity: z.number().min(0).nullable().optional(),
  action: z.string().nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  photoIds: z.array(z.string().uuid()).default([]),
});

export const pickupSchema = z.object({
  done: z.boolean(),
  quantity: z.number().min(0).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  photoIds: z.array(z.string().uuid()).default([]),
});

export const completeDeliverySchema = z.object({
  status: z.enum(["delivered", "partial", "failed"]),
  signerName: z.string().max(200).nullable().optional(),
  signedBlPhotoId: z.string().uuid().nullable().optional(),
  temperature: z.number().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
});

export const positionsSchema = z.object({
  tourId: z.string().uuid().nullable().optional(),
  points: z
    .array(z.object({ lat: z.number(), lng: z.number(), accuracy: z.number().nullable().optional(), at: z.string() }))
    .max(500),
});
