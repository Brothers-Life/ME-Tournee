// Temps réel : WebSocket /ws qui pousse les évènements de l'API ; on invalide les requêtes concernées.
import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API_URL } from "./api";
import type { LiveDriver } from "./types";

export type AppEvent =
  | { type: "imports.changed"; depotId: string }
  | { type: "tours.changed"; depotId: string; tourId?: string }
  | { type: "deliveries.changed"; depotId: string; tourId?: string | null }
  | { type: "incidents.changed"; depotId: string }
  | { type: "positions.changed"; depotId: string; userId: string; lat: number; lng: number; at: string; tourId?: string | null }
  | { type: "vehicle_check.anomaly"; depotId: string; tourId: string };

const KEYS_BY_EVENT: Record<Exclude<AppEvent["type"], "positions.changed">, string[]> = {
  "imports.changed": ["imports", "planning", "dashboard", "deliveries", "tours"],
  "tours.changed": ["planning", "tours", "tour", "dashboard", "deliveries", "gps-live"],
  "deliveries.changed": ["planning", "tours", "tour", "delivery", "deliveries", "dashboard"],
  "incidents.changed": ["incidents", "delivery", "tour", "tours", "dashboard"],
  "vehicle_check.anomaly": ["dashboard", "tour"],
};

export function handleEvent(qc: QueryClient, event: AppEvent) {
  if (event.type === "positions.changed") {
    let matched = false;
    qc.setQueriesData<LiveDriver[]>({ queryKey: ["gps-live"] }, (old) =>
      old?.map((d) => {
        if (event.tourId && d.tourId === event.tourId) {
          matched = true;
          return { ...d, position: { lat: event.lat, lng: event.lng, at: event.at, tourId: event.tourId } };
        }
        return d;
      }),
    );
    if (!matched) qc.invalidateQueries({ queryKey: ["gps-live"] });
    return;
  }
  for (const key of KEYS_BY_EVENT[event.type] ?? []) qc.invalidateQueries({ queryKey: [key] });
  if (event.type === "vehicle_check.anomaly") toast.warning("Anomalie signalée sur un contrôle camion");
}

export type RealtimeStatus = "connecting" | "open" | "closed";

/** Connexion WebSocket avec reconnexion progressive. */
export function useRealtime(token: string | null, enabled = true): RealtimeStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("closed");

  useEffect(() => {
    if (!token || !enabled) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let wasOpen = false;
    let timer: number | undefined;

    const connect = () => {
      setStatus("connecting");
      const url = `${API_URL.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);
      ws.onopen = () => {
        retry = 0;
        setStatus("open");
        // Après une coupure, on rattrape ce qui a pu changer entre-temps.
        if (wasOpen) qc.invalidateQueries();
        wasOpen = true;
      };
      ws.onmessage = (msg) => {
        try {
          handleEvent(qc, JSON.parse(String(msg.data)) as AppEvent);
        } catch {
          /* message ignoré */
        }
      };
      ws.onclose = (e) => {
        setStatus("closed");
        if (stopped || e.code === 4401) return;
        retry += 1;
        timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, [token, enabled, qc]);

  return status;
}
