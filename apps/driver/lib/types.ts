import type { DepotSettings } from '@me/shared';

export interface Line {
  id: string;
  position: number;
  category: string;
  articleCode: string;
  designation: string;
  ean: string | null;
  quantity: string;
  unit: string;
  weightKg: string | null;
  lotNumber: string | null;
  dlc: string | null;
  checkStatus: 'unchecked' | 'ok' | 'issue';
}

export interface Incident {
  id: string;
  lineId: string | null;
  type: string;
  quantity: string | null;
  action: string | null;
  comment: string | null;
  photoIds: string[];
  status: string;
}

export interface Note {
  id: string;
  number: string;
  sequence: number;
  status: 'pending' | 'arrived' | 'delivered' | 'partial' | 'failed';
  windowStart: string | null;
  windowEnd: string | null;
  packageCount: number | null;
  netWeightKg: string | null;
  comment: string | null;
  pickupRequested: boolean;
  arrivedAt: string | null;
  completedAt: string | null;
  clientSnapshot: { name: string; addressLines: string[]; postalCode: string | null; city: string | null; phones: string[] };
  client: { id: string; code: string; name: string; notes: string | null; phones: string[] };
  lines: Line[];
  incidents: Incident[];
  pickup: { done: boolean; quantity: string | null; comment: string | null } | null;
}

export interface VehicleCheck {
  kind: 'departure' | 'return';
  km: number;
}

export interface Tour {
  id: string;
  name: string;
  date: string;
  status: 'draft' | 'validated' | 'in_progress' | 'returned' | 'closed';
  vehicleId: string | null;
  depotId: string;
  checks: VehicleCheck[];
  notes: Note[];
}

export interface Vehicle {
  id: string;
  plate: string;
  fleetNumber: string | null;
  type: 'VL' | 'PL';
  label: string | null;
}

export interface Shift {
  id: string;
  startAt: string;
  endAt: string | null;
  breakStartedAt: string | null;
  breakMinutes: number;
}

export interface Today {
  date: string;
  depot: { id: string; code: string; name: string; settings: DepotSettings } | null;
  shift: Shift | null;
  tours: Tour[];
  vehicles: Vehicle[];
  smsTemplates: { id: string; label: string; body: string }[];
  incidentTypes: { key: string; label: string; actions: string[] }[];
}

export interface Me {
  user: { id: string; firstName: string; lastName: string; login: string | null; mustChangePin: boolean };
}
