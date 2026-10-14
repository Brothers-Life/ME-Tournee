// Hooks react-query : exploitation (tableau de bord, imports, planning, tournées, livraisons, incidents, heures, GPS).
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { IncidentStatus } from "@me/shared";
import { api, uploadFile } from "@/lib/api";
import { useApiMutation } from "@/lib/query-client";
import type {
  Dashboard, DeliveryDetail, DeliveryListItem, ImportItem, IncidentListItem, LiveDriver, Planning, Tour, TourDetail, TourListItem, TimeEntry,
} from "@/lib/types";

// ---------- Tableau de bord / GPS ----------
export function useDashboard(depotId: string | null, date: string) {
  return useQuery({
    queryKey: ["dashboard", depotId, date],
    queryFn: () => api.get<Dashboard>("/dashboard", { depotId, date }),
    enabled: !!depotId,
  });
}

export function useLiveGps(enabled: boolean) {
  return useQuery({ queryKey: ["gps-live"], queryFn: () => api.get<LiveDriver[]>("/gps/live"), enabled, refetchInterval: 60_000 });
}

// ---------- Imports ----------
export function useImports(depotId: string | null) {
  return useQuery({
    queryKey: ["imports", depotId],
    queryFn: () => api.get<ImportItem[]>("/imports", { depotId }),
    enabled: !!depotId,
    // Filet de sécurité si le temps réel est coupé pendant un traitement.
    refetchInterval: (q) => (q.state.data?.some((i) => i.status === "queued" || i.status === "processing") ? 5000 : false),
  });
}

export function useCreateImport() {
  return useApiMutation(
    async ({ depotId, file }: { depotId: string; file: File }) => {
      const f = await uploadFile(file, "pdf");
      return api.post<ImportItem>("/imports", { depotId, fileId: f.id });
    },
    { invalidate: [["imports"]], success: (_d, v) => `« ${v.file.name} » envoyé, import en cours` },
  );
}

// ---------- Planning ----------
export function usePlanning(depotId: string | null, date: string) {
  return useQuery({
    queryKey: ["planning", depotId, date],
    queryFn: () => api.get<Planning>("/planning", { depotId, date }),
    enabled: !!depotId,
    placeholderData: keepPreviousData,
  });
}

const planningKeys = [["planning"], ["tours"], ["tour"], ["dashboard"], ["deliveries"]];

export function useAutoPlan() {
  return useApiMutation((b: { depotId: string; date: string }) => api.post<{ placed?: number; unassigned?: number }>("/planning/auto", b), {
    invalidate: planningKeys,
    success: (r) =>
      typeof r?.placed === "number"
        ? `${r.placed} BL répartis${r.unassigned ? `, ${r.unassigned} restent à répartir` : ""}`
        : "Répartition automatique effectuée",
  });
}

export function useMoveNotes() {
  return useApiMutation((b: { noteIds: string[]; tourId: string | null }) => api.post("/planning/move", b), { invalidate: planningKeys });
}

export function useReorderTour() {
  return useApiMutation((b: { tourId: string; noteIds: string[] }) => api.post(`/tours/${b.tourId}/reorder`, { noteIds: b.noteIds }), {
    invalidate: planningKeys,
  });
}

// ---------- Tournées ----------
export function useTours(params: { depotId?: string | null; date?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ["tours", params],
    queryFn: () => api.get<TourListItem[]>("/tours", params),
    placeholderData: keepPreviousData,
  });
}

export function useTour(id: string | undefined) {
  return useQuery({ queryKey: ["tour", id], queryFn: () => api.get<TourDetail>(`/tours/${id}`), enabled: !!id });
}

export function useCreateTour() {
  return useApiMutation(
    (b: { depotId: string; date: string; name: string; sectorId?: string | null; driverId?: string | null; vehicleId?: string | null }) =>
      api.post<Tour>("/tours", b),
    { invalidate: planningKeys, success: "Tournée créée" },
  );
}

export function useUpdateTour() {
  return useApiMutation(
    ({ id, ...b }: { id: string; name?: string; driverId?: string | null; vehicleId?: string | null; sectorId?: string | null }) =>
      api.patch<Tour>(`/tours/${id}`, b),
    { invalidate: planningKeys },
  );
}

export function useTourAction() {
  return useApiMutation(
    ({ id, action }: { id: string; action: "validate" | "unvalidate" | "close" }) => api.post<Tour>(`/tours/${id}/${action}`),
    {
      invalidate: planningKeys,
      success: (_d, v) => ({ validate: "Tournée validée", unvalidate: "Tournée repassée en brouillon", close: "Tournée clôturée" })[v.action],
    },
  );
}

export function useDeleteTour() {
  return useApiMutation((id: string) => api.delete(`/tours/${id}`), { invalidate: planningKeys, success: "Tournée supprimée" });
}

// ---------- Livraisons ----------
export function useDeliveries(params: { depotId?: string | null; date?: string; status?: string; search?: string; clientId?: string }) {
  return useQuery({
    queryKey: ["deliveries", params],
    queryFn: () => api.get<DeliveryListItem[]>("/deliveries", params),
    placeholderData: keepPreviousData,
  });
}

export function useDelivery(id: string | undefined) {
  return useQuery({ queryKey: ["delivery", id], queryFn: () => api.get<DeliveryDetail>(`/deliveries/${id}`), enabled: !!id });
}

// ---------- Incidents ----------
export function useIncidents(params: { depotId?: string | null; status?: IncidentStatus; from?: string; to?: string }) {
  return useQuery({
    queryKey: ["incidents", params],
    queryFn: () => api.get<IncidentListItem[]>("/incidents", params),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateIncident() {
  return useApiMutation(
    ({ id, ...b }: { id: string; status: IncidentStatus; handledComment?: string | null }) => api.patch(`/incidents/${id}`, b),
    { invalidate: [["incidents"], ["delivery"], ["tour"], ["tours"], ["dashboard"]], success: "Incident mis à jour" },
  );
}

// ---------- Heures ----------
export function useTimeEntries(params: { depotId?: string | null; from: string; to: string; userId?: string }) {
  return useQuery({
    queryKey: ["time-entries", params],
    queryFn: () => api.get<TimeEntry[]>("/time-entries", params),
    placeholderData: keepPreviousData,
  });
}

export function useCorrectTimeEntry() {
  return useApiMutation(
    ({ id, ...b }: { id: string; startAt?: string; endAt?: string | null; breakMinutes?: number; roundedStart?: string; roundedEnd?: string | null; note: string }) =>
      api.patch(`/time-entries/${id}`, b),
    { invalidate: [["time-entries"]], success: "Pointage corrigé" },
  );
}
