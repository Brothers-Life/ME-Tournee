// Formes des réponses de l'API (cf. apps/api/src/routes/*.ts).
// Les colonnes numeric de Postgres arrivent sous forme de chaînes.
import type { DeliveryStatus, DepotSettings, EffectivePermissions, IncidentStatus, Permission, TourStatus, VehicleType } from "@me/shared";

export type Num = string | number | null;

export interface Depot {
  id: string;
  code: string;
  name: string;
  settings: DepotSettings;
  address?: string | null;
  isActive?: boolean;
}

export interface Me {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    login: string | null;
    totpEnabled: boolean;
    hasPanelPin: boolean;
    mustChangePin: boolean;
  };
  kind: "panel" | "driver";
  permissions: EffectivePermissions;
  depots: Depot[];
  allPermissions: Permission[];
}

export interface ClientSnapshot {
  name: string;
  addressLines: string[];
  postalCode: string | null;
  city: string | null;
  phones: string[];
}

export interface PlanningNote {
  id: string;
  number: string;
  tourId: string | null;
  sequence: number;
  status: DeliveryStatus;
  windowStart: string | null;
  windowEnd: string | null;
  packageCount: number | null;
  netWeightKg: Num;
  comment: string | null;
  pickupRequested: boolean;
  clientId: string;
  client: ClientSnapshot;
  clientSectorId: string | null;
}

export interface Tour {
  id: string;
  depotId: string;
  date: string;
  name: string;
  sectorId: string | null;
  driverId: string | null;
  vehicleId: string | null;
  status: TourStatus;
  validatedBy: string | null;
  validatedAt: string | null;
  startedAt: string | null;
  returnedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface PlanningTour extends Tour {
  notes: PlanningNote[];
}

export interface Planning {
  tours: PlanningTour[];
  unassigned: PlanningNote[];
}

export interface TourListItem extends Tour {
  driverName: string | null;
  vehicle: { id: string; plate: string; fleetNumber: string | null; type: VehicleType } | null;
  total: number;
  done: number;
  packages: number;
  weightKg: number;
  openIncidents: number;
}

export interface DeliveryNote {
  id: string;
  depotId: string;
  importId: string | null;
  number: string;
  orderNumber: string | null;
  orderDate: string | null;
  departureAt: string | null;
  deliveryDate: string;
  carrier: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  clientId: string;
  clientSnapshot: ClientSnapshot;
  packageCount: number | null;
  netWeightKg: Num;
  comment: string | null;
  sourcePage: number | null;
  tourId: string | null;
  sequence: number;
  status: DeliveryStatus;
  arrivedAt: string | null;
  arrivalLat: number | null;
  arrivalLng: number | null;
  completedAt: string | null;
  completedLat: number | null;
  completedLng: number | null;
  signerName: string | null;
  signedBlPhotoId: string | null;
  temperature: Num;
  driverComment: string | null;
  pickupRequested: boolean;
  createdAt: string;
}

export interface VehicleCheck {
  id: string;
  tourId: string;
  vehicleId: string;
  driverId: string;
  kind: "departure" | "return";
  km: number;
  kmPhotoId: string | null;
  clean: boolean | null;
  fuelFull: boolean | null;
  warningLights: boolean | null;
  fridgeOk: boolean | null;
  temperature: Num;
  palettes: number | null;
  comment: string | null;
  photoIds: string[];
  hasAnomaly: boolean;
  createdAt: string;
}

export interface Incident {
  id: string;
  deliveryNoteId: string;
  lineId: string | null;
  type: string;
  quantity: Num;
  action: string | null;
  comment: string | null;
  photoIds: string[];
  status: IncidentStatus;
  handledBy: string | null;
  handledComment: string | null;
  handledAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface IncidentListItem extends Incident {
  note: { id: string; number: string; depotId: string; deliveryDate: string; client: ClientSnapshot; tourId: string | null };
  line: { designation: string; articleCode: string; quantity: Num; unit: string } | null;
  createdByName: string | null;
}

export interface Vehicle {
  id: string;
  depotId: string;
  plate: string;
  fleetNumber: string | null;
  type: VehicleType;
  label: string | null;
  capacityKg: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface TourDetail extends Tour {
  notes: DeliveryNote[];
  checks: VehicleCheck[];
  driver: { id: string; firstName: string; lastName: string; phone: string | null } | null;
  vehicle: Vehicle | null;
  incidents: Incident[];
  lastPosition: LivePosition | null;
}

export interface DeliveryLine {
  id: string;
  deliveryNoteId: string;
  position: number;
  category: string;
  articleCode: string;
  designation: string;
  ean: string | null;
  quantity: Num;
  unit: string;
  weightKg: Num;
  lotNumber: string | null;
  dlc: string | null;
  checkStatus: "unchecked" | "ok" | "issue";
}

export interface Pickup {
  id: string;
  deliveryNoteId: string;
  done: boolean;
  quantity: Num;
  comment: string | null;
  photoIds: string[];
  createdAt: string;
}

export interface Communication {
  id: string;
  deliveryNoteId: string | null;
  userId: string | null;
  kind: "call" | "sms";
  to: string;
  body: string | null;
  createdAt: string;
}

export interface DeliveryDetail extends DeliveryNote {
  client: { id: string; code: string; name: string; notes: string | null; emailSignedBl: boolean; phones: string[] };
  lines: DeliveryLine[];
  incidents: Incident[];
  pickup: Pickup | null;
  communications: Communication[];
}

export interface DeliveryListItem {
  id: string;
  number: string;
  depotId: string;
  deliveryDate: string;
  status: DeliveryStatus;
  client: ClientSnapshot;
  tourId: string | null;
  tourName: string | null;
  packageCount: number | null;
  completedAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
}

export type ImportStatus = "queued" | "processing" | "done" | "failed";

export interface ImportItem {
  id: string;
  depotId: string;
  fileId: string | null;
  fileName: string;
  source: "upload" | "email";
  status: ImportStatus;
  blCount: number;
  newClients: number;
  skipped: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  createdByName: string | null;
}

export interface Dashboard {
  date: string;
  notes: { total: number; delivered: number; failed: number; unassigned: number; packages: number };
  tours: Partial<Record<TourStatus, number>>;
  openIncidents: number;
  vehicleAnomalies: (VehicleCheck & { tourName: string; plate: string })[];
}

export interface LivePosition {
  lat: number;
  lng: number;
  at: string;
  accuracy?: number | null;
  tourId?: string | null;
}

export interface LiveDriver {
  tourId: string;
  tourName: string;
  depotId: string;
  driverName: string;
  position: LivePosition | null;
}

export interface GpsPoint {
  id: string;
  userId: string;
  tourId: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  recordedAt: string;
}

export interface Assignment {
  id: string;
  userId: string;
  roleId: string;
  depotId: string | null;
  roleName: string;
  roleKey: string | null;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  login: string | null;
  isActive: boolean;
  locked: boolean;
  totpEnabled: boolean;
  hasPassword: boolean;
  hasDriverPin: boolean;
  roundingOffset: number;
  lastLoginAt: string | null;
  createdAt: string;
  assignments: Assignment[];
}

export interface Role {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  permissions: Permission[];
  isSystem: boolean;
  createdAt: string;
}

export interface PermissionOverride {
  id?: string;
  userId?: string;
  permission: Permission;
  depotId: string | null;
  effect: "grant" | "deny";
}

export interface Sector {
  id: string;
  depotId: string;
  name: string;
  color: string;
  postalCodes: string[];
  cities: string[];
  defaultDriverId: string | null;
  defaultVehicleId: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface Client {
  id: string;
  code: string;
  name: string;
  addressLines: string[];
  postalCode: string | null;
  city: string | null;
  phones: string[];
  email: string | null;
  emailSignedBl: boolean;
  sectorId: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmsTemplate {
  id: string;
  depotId: string | null;
  label: string;
  body: string;
  sortOrder: number;
}

export interface IncidentType {
  id: string;
  key: string;
  label: string;
  actions: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface TimeEntry {
  id: string;
  userId: string;
  depotId: string;
  date: string;
  startAt: string;
  endAt: string | null;
  breakMinutes: number;
  breakStartedAt: string | null;
  roundedStart: string | null;
  roundedEnd: string | null;
  offsetAfter: number | null;
  correctedBy: string | null;
  note: string | null;
  createdAt: string;
  userName: string;
  currentOffset: number;
  real: number | null;
  paid: number | null;
}

export interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  depotId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
  userName: string | null;
}
