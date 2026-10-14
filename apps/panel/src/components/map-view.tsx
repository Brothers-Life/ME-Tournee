// Carte MapLibre avec tuiles OpenStreetMap raster : marqueurs et tracé optionnel.
import { useEffect, useRef } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre 6 résout son worker relativement à son propre module : on lui donne l'URL servie par Vite.
setWorkerUrl(workerUrl);
import { cn } from "@/lib/utils";

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">contributeurs OpenStreetMap</a>',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Bordeaux par défaut (dépôt pilote).
const DEFAULT_CENTER: [number, number] = [-0.58, 44.84];

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  detail?: string;
  color?: string;
}

export function MapView({
  markers = [], track, className, fitKey,
}: {
  markers?: MapMarker[];
  /** Tracé GPS [lng, lat][]. */
  track?: [number, number][];
  className?: string;
  /** Change de valeur => recadrage sur les éléments. */
  fitKey?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef(new Map<string, Marker>());
  const loaded = useRef(false);
  const onReady = useRef<(() => void) | null>(null);
  const fitted = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({ container: container.current, style: OSM_STYLE, center: DEFAULT_CENTER, zoom: 8, attributionControl: { compact: true } });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      loaded.current = true;
      map.addSource("track", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "track", type: "line", source: "track", paint: { "line-color": "#2563eb", "line-width": 4, "line-opacity": 0.8 } });
      onReady.current?.();
      onReady.current = null;
    });
    mapRef.current = map;
    const refs = markerRefs.current;
    return () => {
      for (const m of refs.values()) m.remove();
      refs.clear();
      loaded.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Marqueurs : mis à jour sur place pour suivre les positions en direct.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      const existing = markerRefs.current.get(m.id);
      if (existing) {
        existing.setLngLat([m.lng, m.lat]);
        existing.getPopup()?.setHTML(popupHtml(m));
      } else {
        const marker = new Marker({ color: m.color ?? "#171717" })
          .setLngLat([m.lng, m.lat])
          .setPopup(new Popup({ offset: 24, closeButton: false }).setHTML(popupHtml(m)))
          .addTo(map);
        markerRefs.current.set(m.id, marker);
      }
    }
    for (const [id, marker] of markerRefs.current) {
      if (!seen.has(id)) {
        marker.remove();
        markerRefs.current.delete(id);
      }
    }
  }, [markers]);

  // Tracé + recadrage.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("track") as { setData?: (d: unknown) => void } | undefined;
      src?.setData?.({
        type: "FeatureCollection",
        features: track && track.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track } }] : [],
      });
      const key = fitKey ?? "default";
      if (fitted.current === key) return;
      const pts: [number, number][] = [...(track ?? []), ...markers.map((m) => [m.lng, m.lat] as [number, number])];
      if (!pts.length) return;
      fitted.current = key;
      if (pts.length === 1) map.jumpTo({ center: pts[0], zoom: 12 });
      else {
        const b = new LngLatBounds(pts[0], pts[0]);
        for (const p of pts) b.extend(p);
        map.fitBounds(b, { padding: 48, maxZoom: 14, duration: 0 });
      }
    };
    if (loaded.current) apply();
    else onReady.current = apply;
  }, [track, markers, fitKey]);

  return <div ref={container} className={cn("h-80 w-full overflow-hidden rounded-lg border", className)} />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function popupHtml(m: MapMarker) {
  return `<div style="font:13px/1.4 system-ui,sans-serif"><strong>${escapeHtml(m.label)}</strong>${m.detail ? `<br/><span style="color:#666">${escapeHtml(m.detail)}</span>` : ""}</div>`;
}
