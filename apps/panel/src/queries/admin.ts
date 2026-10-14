// Hooks react-query : référentiels et administration.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DEFAULT_INCIDENT_TYPES, type DepotSettings, type Permission, type VehicleType } from "@me/shared";
import { api } from "@/lib/api";
import { useApiMutation } from "@/lib/query-client";
import type { AuditEntry, Client, Depot, IncidentType, PermissionOverride, Role, Sector, SmsTemplate, User, Vehicle } from "@/lib/types";

// ---------- Utilisateurs ----------
export function useUsers(params: { depotId?: string | null; role?: string; search?: string } = {}, enabled = true) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => api.get<User[]>("/users", params),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Chauffeurs d'un dépôt (rôle « driver »). */
export function useDrivers(depotId: string | null, enabled = true) {
  return useUsers({ depotId, role: "driver" }, enabled && !!depotId);
}

export interface UserInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  login?: string | null;
  password?: string | null;
  driverPin?: string | null;
  panelPin?: string | null;
  assignments?: { roleId: string; depotId: string | null }[];
  isActive?: boolean;
  unlock?: boolean;
}

export function useSaveUser() {
  return useApiMutation(
    ({ id, ...b }: Partial<UserInput> & { id?: string }) => (id ? api.patch<User>(`/users/${id}`, b) : api.post<User>("/users", b)),
    { invalidate: [["users"], ["me"]], success: (_d, v) => (v.id ? "Utilisateur enregistré" : "Utilisateur créé") },
  );
}

export function useOverrides(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["overrides", userId],
    queryFn: () => api.get<PermissionOverride[]>(`/users/${userId}/overrides`),
    enabled: !!userId && enabled,
  });
}

export function useSaveOverrides() {
  return useApiMutation(
    ({ userId, overrides }: { userId: string; overrides: { permission: Permission; depotId: string | null; effect: "grant" | "deny" }[] }) =>
      api.put(`/users/${userId}/overrides`, overrides),
    { invalidate: [["overrides"], ["me"]], success: "Exceptions de permissions enregistrées" },
  );
}

// ---------- Rôles ----------
export function useRoles(enabled = true) {
  return useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/roles"), enabled, staleTime: 60_000 });
}

export function useSaveRole() {
  return useApiMutation(
    ({ id, ...b }: { id?: string; name?: string; description?: string | null; permissions?: Permission[] }) =>
      id ? api.patch<Role>(`/roles/${id}`, b) : api.post<Role>("/roles", b),
    { invalidate: [["roles"], ["me"], ["users"]], success: (_d, v) => (v.id ? "Rôle enregistré" : "Rôle créé") },
  );
}

export function useDeleteRole() {
  return useApiMutation((id: string) => api.delete(`/roles/${id}`), { invalidate: [["roles"], ["users"]], success: "Rôle supprimé" });
}

// ---------- Véhicules ----------
export function useVehicles(depotId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["vehicles", depotId],
    queryFn: () => api.get<Vehicle[]>("/vehicles", { depotId }),
    enabled: enabled && !!depotId,
  });
}

export interface VehicleInput {
  depotId: string;
  plate: string;
  fleetNumber?: string | null;
  type: VehicleType;
  label?: string | null;
  capacityKg?: number | null;
  isActive?: boolean;
}

export function useSaveVehicle() {
  return useApiMutation(
    ({ id, ...b }: VehicleInput & { id?: string }) => (id ? api.patch<Vehicle>(`/vehicles/${id}`, b) : api.post<Vehicle>("/vehicles", b)),
    { invalidate: [["vehicles"]], success: (_d, v) => (v.id ? "Véhicule enregistré" : "Véhicule ajouté") },
  );
}

// ---------- Secteurs ----------
export function useSectors(depotId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["sectors", depotId],
    queryFn: () => api.get<Sector[]>("/sectors", { depotId }),
    enabled: enabled && !!depotId,
  });
}

export interface SectorInput {
  depotId: string;
  name: string;
  color?: string;
  postalCodes: string[];
  cities: string[];
  defaultDriverId?: string | null;
  defaultVehicleId?: string | null;
  sortOrder?: number;
}

export function useSaveSector() {
  return useApiMutation(
    ({ id, depotId, ...b }: SectorInput & { id?: string }) =>
      id ? api.patch<Sector>(`/sectors/${id}`, b) : api.post<Sector>("/sectors", { depotId, ...b }),
    { invalidate: [["sectors"]], success: (_d, v) => (v.id ? "Secteur enregistré" : "Secteur créé") },
  );
}

export function useDeleteSector() {
  return useApiMutation((id: string) => api.delete(`/sectors/${id}`), { invalidate: [["sectors"]], success: "Secteur supprimé" });
}

// ---------- Clients ----------
export function useClients(params: { search?: string; sectorId?: string }) {
  return useQuery({
    queryKey: ["clients", params],
    queryFn: () => api.get<Client[]>("/clients", { ...params, limit: 300 }),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateClient() {
  return useApiMutation(
    ({ id, ...b }: { id: string; sectorId?: string | null; email?: string | null; emailSignedBl?: boolean; notes?: string | null }) =>
      api.patch<Client>(`/clients/${id}`, b),
    { invalidate: [["clients"]], success: "Client enregistré" },
  );
}

// ---------- Dépôt et réglages ----------
export function useUpdateDepot() {
  return useApiMutation(
    ({ id, ...b }: { id: string; name?: string; address?: string | null; settings?: Partial<DepotSettings> }) => api.patch<Depot>(`/depots/${id}`, b),
    { invalidate: [["me"]], success: "Réglages enregistrés" },
  );
}

export function useSmsTemplates(depotId: string | null) {
  return useQuery({
    queryKey: ["sms-templates", depotId],
    queryFn: () => api.get<SmsTemplate[]>("/sms-templates", { depotId }),
    enabled: !!depotId,
  });
}

export function useSaveSmsTemplates() {
  return useApiMutation(
    (b: { depotId: string | null; templates: { label: string; body: string }[] }) => api.put("/sms-templates", b),
    { invalidate: [["sms-templates"]], success: "SMS prédéfinis enregistrés" },
  );
}

export function useIncidentTypes() {
  return useQuery({ queryKey: ["incident-types"], queryFn: () => api.get<IncidentType[]>("/incident-types"), staleTime: 5 * 60_000 });
}

/** Libellé d'un type d'incident à partir de sa clé. */
export function useIncidentTypeLabel() {
  const { data } = useIncidentTypes();
  return (key: string) => data?.find((t) => t.key === key)?.label ?? DEFAULT_INCIDENT_TYPES.find((t) => t.key === key)?.label ?? key;
}

export function useSaveIncidentTypes() {
  return useApiMutation(
    (b: { key: string; label: string; actions: string[]; isActive: boolean }[]) => api.put("/incident-types", b),
    { invalidate: [["incident-types"]], success: "Types d'incident enregistrés" },
  );
}

// ---------- Audit ----------
export function useAudit(params: { entity?: string; limit?: number; before?: string }) {
  return useQuery({
    queryKey: ["audit", params],
    queryFn: () => api.get<AuditEntry[]>("/audit", params),
    placeholderData: keepPreviousData,
  });
}

// ---------- Mon compte ----------
export function useChangePassword() {
  return useApiMutation((b: { current: string; next: string }) => api.post("/me/password", b));
}

export function useSetPanelPin() {
  return useApiMutation((b: { password: string; newPin: string }) => api.post("/me/panel-pin", b), {
    invalidate: [["me"]],
    success: "Code PIN enregistré",
  });
}

export function useTotpSetup() {
  return useApiMutation(() => api.post<{ secret: string; uri: string }>("/me/totp/setup"));
}

export function useTotpEnable() {
  return useApiMutation((token: string) => api.post("/me/totp/enable", { token }), {
    invalidate: [["me"]],
    success: "Double authentification activée",
  });
}

export function useTotpDisable() {
  return useApiMutation((password: string) => api.post("/me/totp/disable", { password }), {
    invalidate: [["me"]],
    success: "Double authentification désactivée",
  });
}
