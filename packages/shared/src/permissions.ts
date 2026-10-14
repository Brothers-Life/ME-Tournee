// Catalogue des permissions. Une permission est toujours donnée dans un périmètre :
// globale (tous les dépôts) ou limitée à un dépôt, via l'affectation rôle × dépôt.

export const PERMISSIONS = {
  "dashboard.view": "Voir le tableau de bord",
  "imports.view": "Voir les imports de BL",
  "imports.create": "Importer des BL (PDF)",
  "tours.view": "Voir les tournées",
  "tours.manage": "Créer et modifier les tournées",
  "tours.validate": "Valider les tournées",
  "tours.delete": "Supprimer une tournée",
  "deliveries.view": "Voir les livraisons et les BL",
  "deliveries.edit": "Corriger une livraison",
  "incidents.view": "Voir les incidents",
  "incidents.manage": "Traiter les incidents",
  "clients.view": "Voir les clients",
  "clients.contacts": "Voir les coordonnées des clients",
  "clients.manage": "Modifier les clients",
  "vehicles.view": "Voir les véhicules",
  "vehicles.manage": "Gérer les véhicules",
  "sectors.manage": "Gérer les secteurs",
  "users.view": "Voir les utilisateurs",
  "users.manage": "Gérer les utilisateurs et leurs rôles",
  "roles.manage": "Gérer les rôles et les permissions",
  "time.view": "Voir les heures de travail",
  "time.manage": "Corriger les heures de travail",
  "time.export": "Exporter les heures (paie)",
  "gps.live": "Voir la position des chauffeurs en direct",
  "gps.history": "Voir l'historique GPS",
  "audit.view": "Voir le journal d'audit",
  "depots.manage": "Configurer le dépôt",
  "settings.manage": "Gérer les réglages (SMS, types d'incident)",
  "driver.app": "Utiliser l'app chauffeur",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: "Général", permissions: ["dashboard.view", "audit.view"] },
  { label: "Imports et tournées", permissions: ["imports.view", "imports.create", "tours.view", "tours.manage", "tours.validate", "tours.delete"] },
  { label: "Livraisons", permissions: ["deliveries.view", "deliveries.edit", "incidents.view", "incidents.manage"] },
  { label: "Clients", permissions: ["clients.view", "clients.contacts", "clients.manage"] },
  { label: "Flotte", permissions: ["vehicles.view", "vehicles.manage", "sectors.manage"] },
  { label: "Équipe", permissions: ["users.view", "users.manage", "roles.manage"] },
  { label: "Heures", permissions: ["time.view", "time.manage", "time.export"] },
  { label: "GPS", permissions: ["gps.live", "gps.history"] },
  { label: "Configuration", permissions: ["depots.manage", "settings.manage"] },
  { label: "Chauffeur", permissions: ["driver.app"] },
];

// Actions qui demandent la confirmation par PIN perso dans le panel.
export const PIN_PROTECTED_ACTIONS = [
  "tours.delete",
  "time.manage",
  "gps.history",
  "roles.manage",
  "users.manage",
] as const satisfies readonly Permission[];

export interface DefaultRole {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    key: "super_admin",
    name: "Super admin",
    description: "Tous les droits, y compris rôles et configuration",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "direction",
    name: "Direction",
    description: "Voit tout, modifie peu",
    permissions: ["dashboard.view", "imports.view", "tours.view", "deliveries.view", "incidents.view", "clients.view", "clients.contacts", "vehicles.view", "users.view", "time.view", "time.export", "gps.live", "audit.view"],
  },
  {
    key: "depot_manager",
    name: "Responsable de dépôt",
    description: "Configure son dépôt, valide les tournées, gère incidents et heures",
    permissions: ["dashboard.view", "imports.view", "imports.create", "tours.view", "tours.manage", "tours.validate", "tours.delete", "deliveries.view", "deliveries.edit", "incidents.view", "incidents.manage", "clients.view", "clients.contacts", "clients.manage", "vehicles.view", "vehicles.manage", "sectors.manage", "users.view", "users.manage", "time.view", "time.manage", "time.export", "gps.live", "gps.history", "audit.view", "depots.manage", "settings.manage"],
  },
  {
    key: "dispatcher",
    name: "Exploitant / planning",
    description: "Importe les BL, ajuste et valide les tournées, suit en direct",
    permissions: ["dashboard.view", "imports.view", "imports.create", "tours.view", "tours.manage", "tours.validate", "deliveries.view", "incidents.view", "clients.view", "clients.contacts", "vehicles.view", "users.view", "gps.live"],
  },
  {
    key: "sales",
    name: "Commercial",
    description: "Voit les livraisons et incidents de ses clients",
    permissions: ["dashboard.view", "deliveries.view", "incidents.view", "clients.view", "clients.contacts"],
  },
  {
    key: "customer_service",
    name: "ADV / service client",
    description: "Traite les incidents, consulte les BL signés",
    permissions: ["dashboard.view", "deliveries.view", "incidents.view", "incidents.manage", "clients.view", "clients.contacts"],
  },
  {
    key: "hr",
    name: "RH / paie",
    description: "Heures et exports paie, pas de GPS",
    permissions: ["users.view", "time.view", "time.manage", "time.export"],
  },
  {
    key: "driver",
    name: "Chauffeur",
    description: "App mobile uniquement",
    permissions: ["driver.app"],
  },
];

/** Droits effectifs : liste de permissions par dépôt, "*" représentant le périmètre global. */
export type EffectivePermissions = Record<string, Permission[]>;

export function can(eff: EffectivePermissions, perm: Permission, depotId?: string | null): boolean {
  if (eff["*"]?.includes(perm)) return true;
  if (depotId) return eff[depotId]?.includes(perm) ?? false;
  // Sans dépôt précis : vrai si la permission existe dans au moins un dépôt.
  return Object.values(eff).some((perms) => perms.includes(perm));
}

/** Dépôts où l'utilisateur a la permission ; null = tous les dépôts. */
export function depotsWith(eff: EffectivePermissions, perm: Permission): string[] | null {
  if (eff["*"]?.includes(perm)) return null;
  return Object.entries(eff)
    .filter(([key, perms]) => key !== "*" && perms.includes(perm))
    .map(([key]) => key);
}
