import { useMemo } from "react";
import { Link } from "react-router";
import { CheckCircle2Icon, InboxIcon, PackageIcon, TruckIcon, XCircleIcon, FileTextIcon } from "lucide-react";
import { TOUR_STATUSES, TOUR_STATUS_LABELS } from "@me/shared";
import { useAuth } from "@/lib/auth";
import { useDashboard, useLiveGps } from "@/queries/ops";
import { formatDay, formatTime } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TOUR_TONES, TONES, TONE_DOTS } from "@/components/status-badge";
import { MapView, type MapMarker } from "@/components/map-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function Stat({ label, value, icon, tone, to }: { label: string; value: number | undefined; icon: React.ReactNode; tone?: string; to?: string }) {
  const body = (
    <Card className={cn("gap-1 py-4", to && "transition-colors hover:bg-muted/40")}>
      <CardContent className="flex items-center justify-between px-4">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">{value ?? <Skeleton className="mt-1 h-7 w-10" />}</div>
        </div>
        <div className={cn("flex size-9 items-center justify-center rounded-full [&_svg]:size-4", tone ?? "bg-muted text-muted-foreground")}>{icon}</div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function DashboardPage() {
  const { depotId, depot, date, can } = useAuth();
  const { data } = useDashboard(depotId, date);
  const canLive = can("gps.live");
  const live = useLiveGps(canLive);

  const markers = useMemo<MapMarker[]>(
    () =>
      (live.data ?? [])
        .filter((d) => d.position && (!depotId || d.depotId === depotId))
        .map((d) => ({
          id: d.tourId,
          lat: d.position!.lat,
          lng: d.position!.lng,
          label: d.driverName,
          detail: `${d.tourName} · ${formatTime(d.position!.at)}`,
          color: "#2563eb",
        })),
    [live.data, depotId],
  );
  const inTour = (live.data ?? []).filter((d) => !depotId || d.depotId === depotId);

  const n = data?.notes;
  const pending = n ? n.total - n.delivered - n.failed : undefined;

  return (
    <div className="grid gap-4">
      <PageHeader title="Tableau de bord" description={<span className="first-letter:uppercase">{`${depot?.name ?? ""} · ${formatDay(date)}`}</span>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="BL du jour" value={n?.total} icon={<FileTextIcon />} to="/deliveries" />
        <Stat label="Livrés" value={n?.delivered} icon={<CheckCircle2Icon />} tone={TONES.green} />
        <Stat label="Non livrés" value={n?.failed} icon={<XCircleIcon />} tone={TONES.red} />
        <Stat label="À livrer" value={pending} icon={<TruckIcon />} tone={TONES.amber} />
        <Stat label="Non affectés" value={n?.unassigned} icon={<InboxIcon />} tone={TONES.blue} to="/planning" />
        <Stat label="Colis" value={n?.packages} icon={<PackageIcon />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Tournées</CardTitle>
            <CardDescription>Par statut</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {TOUR_STATUSES.map((s) => (
              <div key={s} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-full", TONE_DOTS[TOUR_TONES[s]])} />
                  {TOUR_STATUS_LABELS[s]}
                </span>
                <span className="font-medium tabular-nums">{data?.tours[s] ?? 0}</span>
              </div>
            ))}
            <Link to="/tours" className="pt-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
              Voir les tournées
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Incidents ouverts</CardTitle>
            <CardDescription>Nouveaux ou pris en charge, tous jours confondus</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className={cn("text-4xl font-semibold tabular-nums", data?.openIncidents ? "text-red-600" : "")}>{data?.openIncidents ?? "—"}</span>
            {can("incidents.view") && (
              <Link to="/incidents" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                Traiter les incidents
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Anomalies camion
              {!!data?.vehicleAnomalies.length && <Badge variant="destructive">{data.vehicleAnomalies.length}</Badge>}
            </CardTitle>
            <CardDescription>Contrôles départ / retour du jour</CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.vehicleAnomalies.length ? (
              <p className="text-sm text-muted-foreground">Aucune anomalie signalée.</p>
            ) : (
              <ul className="grid gap-2">
                {data.vehicleAnomalies.map((a) => (
                  <li key={a.id} className="rounded-md border p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/tours/${a.tourId}`} className="font-medium hover:underline">
                        {a.tourName}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {a.plate} · {a.kind === "departure" ? "départ" : "retour"} {formatTime(a.createdAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {a.warningLights && <Badge variant="destructive">Voyants allumés</Badge>}
                      {a.fridgeOk === false && <Badge variant="destructive">Groupe froid</Badge>}
                      {a.clean === false && <Badge variant="outline">Propreté</Badge>}
                      {a.fuelFull === false && <Badge variant="outline">Carburant</Badge>}
                    </div>
                    {a.comment && <p className="mt-1 text-muted-foreground">« {a.comment} »</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canLive && (
        <Card>
          <CardHeader>
            <CardTitle>Chauffeurs en tournée</CardTitle>
            <CardDescription>Position en direct (aujourd'hui uniquement)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <MapView markers={markers} className="h-96" fitKey={`${depotId}:${markers.length}`} />
            <div className="grid content-start gap-2">
              {!inTour.length ? (
                <EmptyState title="Aucun chauffeur en tournée">Les positions apparaissent dès le départ d'une tournée.</EmptyState>
              ) : (
                inTour.map((d) => (
                  <Link key={d.tourId} to={`/tours/${d.tourId}`} className="rounded-md border p-2 text-sm hover:bg-muted/40">
                    <div className="font-medium">{d.driverName}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.tourName} · {d.position ? `vu à ${formatTime(d.position.at)}` : "pas de position"}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
