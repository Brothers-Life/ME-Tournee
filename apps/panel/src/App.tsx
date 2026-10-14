import { lazy, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Loader2Icon, ShieldOffIcon } from "lucide-react";
import type { Permission } from "@me/shared";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/app-layout";
import { ALL_NAV_ITEMS } from "@/components/nav";
import { EmptyState } from "@/components/page-header";
import { LoginPage } from "@/pages/login";
import { LockScreen } from "@/pages/lock";

const DashboardPage = lazy(() => import("@/pages/dashboard").then((m) => ({ default: m.DashboardPage })));
const ImportsPage = lazy(() => import("@/pages/imports").then((m) => ({ default: m.ImportsPage })));
const PlanningPage = lazy(() => import("@/pages/planning").then((m) => ({ default: m.PlanningPage })));
const ToursPage = lazy(() => import("@/pages/tours").then((m) => ({ default: m.ToursPage })));
const TourDetailPage = lazy(() => import("@/pages/tour-detail").then((m) => ({ default: m.TourDetailPage })));
const DeliveriesPage = lazy(() => import("@/pages/deliveries").then((m) => ({ default: m.DeliveriesPage })));
const DeliveryDetailPage = lazy(() => import("@/pages/delivery-detail").then((m) => ({ default: m.DeliveryDetailPage })));
const IncidentsPage = lazy(() => import("@/pages/incidents").then((m) => ({ default: m.IncidentsPage })));
const TimePage = lazy(() => import("@/pages/time").then((m) => ({ default: m.TimePage })));
const ClientsPage = lazy(() => import("@/pages/clients").then((m) => ({ default: m.ClientsPage })));
const VehiclesPage = lazy(() => import("@/pages/vehicles").then((m) => ({ default: m.VehiclesPage })));
const SectorsPage = lazy(() => import("@/pages/sectors").then((m) => ({ default: m.SectorsPage })));
const UsersPage = lazy(() => import("@/pages/users").then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import("@/pages/roles").then((m) => ({ default: m.RolesPage })));
const SettingsPage = lazy(() => import("@/pages/settings").then((m) => ({ default: m.SettingsPage })));
const AuditPage = lazy(() => import("@/pages/audit").then((m) => ({ default: m.AuditPage })));
const AccountPage = lazy(() => import("@/pages/account").then((m) => ({ default: m.AccountPage })));

function FullScreenLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center text-muted-foreground">
      <Loader2Icon className="size-6 animate-spin" />
    </div>
  );
}

function Protected() {
  const { token, me, meLoading, locked } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (meLoading || !me) return <FullScreenLoader />;
  return (
    <>
      <AppLayout />
      {locked && <LockScreen />}
    </>
  );
}

/** Page réservée : l'une des permissions suffit (dans le dépôt courant). */
function Guard({ perms, children }: { perms: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!perms.some((p) => can(p)))
    return (
      <EmptyState icon={<ShieldOffIcon />} title="Accès non autorisé">
        Vous n'avez pas les droits nécessaires pour cette page dans ce dépôt.
      </EmptyState>
    );
  return <>{children}</>;
}

function Home() {
  const { can } = useAuth();
  if (can("dashboard.view")) return <DashboardPage />;
  const first = ALL_NAV_ITEMS.find((i) => i.to !== "/" && i.perms.some((p) => can(p)));
  return first ? <Navigate to={first.to} replace /> : <Navigate to="/account" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route index element={<Home />} />
        <Route path="imports" element={<Guard perms={["imports.view"]}><ImportsPage /></Guard>} />
        <Route path="planning" element={<Guard perms={["tours.view"]}><PlanningPage /></Guard>} />
        <Route path="tours" element={<Guard perms={["tours.view"]}><ToursPage /></Guard>} />
        <Route path="tours/:id" element={<Guard perms={["tours.view"]}><TourDetailPage /></Guard>} />
        <Route path="deliveries" element={<Guard perms={["deliveries.view"]}><DeliveriesPage /></Guard>} />
        <Route path="deliveries/:id" element={<Guard perms={["deliveries.view"]}><DeliveryDetailPage /></Guard>} />
        <Route path="incidents" element={<Guard perms={["incidents.view"]}><IncidentsPage /></Guard>} />
        <Route path="time" element={<Guard perms={["time.view"]}><TimePage /></Guard>} />
        <Route path="clients" element={<Guard perms={["clients.view"]}><ClientsPage /></Guard>} />
        <Route path="vehicles" element={<Guard perms={["vehicles.view"]}><VehiclesPage /></Guard>} />
        <Route path="sectors" element={<Guard perms={["sectors.manage"]}><SectorsPage /></Guard>} />
        <Route path="users" element={<Guard perms={["users.view"]}><UsersPage /></Guard>} />
        <Route path="roles" element={<Guard perms={["roles.manage"]}><RolesPage /></Guard>} />
        <Route path="settings" element={<Guard perms={["depots.manage", "settings.manage"]}><SettingsPage /></Guard>} />
        <Route path="audit" element={<Guard perms={["audit.view"]}><AuditPage /></Guard>} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<EmptyState title="Page introuvable">Cette adresse ne correspond à aucune page du panel.</EmptyState>} />
      </Route>
    </Routes>
  );
}
