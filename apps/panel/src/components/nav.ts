import {
  AlertTriangleIcon, ClipboardListIcon, ClockIcon, FileUpIcon, HistoryIcon, LayoutDashboardIcon, MapIcon, PackageIcon,
  RouteIcon, SettingsIcon, ShieldCheckIcon, StoreIcon, TruckIcon, UsersIcon, type LucideIcon,
} from "lucide-react";
import type { Permission } from "@me/shared";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Une des permissions suffit. */
  perms: Permission[];
  /** Page journalière : affiche le sélecteur de date. */
  daily?: boolean;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Exploitation",
    items: [
      { to: "/", label: "Tableau de bord", icon: LayoutDashboardIcon, perms: ["dashboard.view"], daily: true },
      { to: "/imports", label: "Imports", icon: FileUpIcon, perms: ["imports.view"] },
      { to: "/planning", label: "Planning", icon: RouteIcon, perms: ["tours.view"], daily: true },
      { to: "/tours", label: "Tournées", icon: TruckIcon, perms: ["tours.view"], daily: true },
      { to: "/deliveries", label: "Livraisons", icon: PackageIcon, perms: ["deliveries.view"], daily: true },
      { to: "/incidents", label: "Incidents", icon: AlertTriangleIcon, perms: ["incidents.view"] },
    ],
  },
  {
    label: "Équipe",
    items: [
      { to: "/time", label: "Heures", icon: ClockIcon, perms: ["time.view"] },
      { to: "/users", label: "Utilisateurs", icon: UsersIcon, perms: ["users.view"] },
      { to: "/roles", label: "Rôles", icon: ShieldCheckIcon, perms: ["roles.manage"] },
    ],
  },
  {
    label: "Référentiels",
    items: [
      { to: "/clients", label: "Clients", icon: StoreIcon, perms: ["clients.view"] },
      { to: "/vehicles", label: "Véhicules", icon: ClipboardListIcon, perms: ["vehicles.view"] },
      { to: "/sectors", label: "Secteurs", icon: MapIcon, perms: ["sectors.manage"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/settings", label: "Réglages du dépôt", icon: SettingsIcon, perms: ["depots.manage", "settings.manage"] },
      { to: "/audit", label: "Journal d'audit", icon: HistoryIcon, perms: ["audit.view"] },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
