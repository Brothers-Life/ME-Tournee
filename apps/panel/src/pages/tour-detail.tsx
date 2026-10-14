import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeftIcon, CheckIcon, Loader2Icon, LockIcon, MapPinnedIcon, MessageSquareTextIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useTour, useTourAction } from "@/queries/ops";
import { formatDateTime, formatDay, formatKg, formatNumber, formatTime, formatWindow, fullName } from "@/lib/format";
import type { GpsPoint, VehicleCheck } from "@/lib/types";
import { PageHeader, InfoRow, EmptyState } from "@/components/page-header";
import { DeliveryStatusBadge, TourStatusBadge, IncidentStatusBadge } from "@/components/status-badge";
import { PhotoGrid } from "@/components/auth-image";
import { MapView, type MapMarker } from "@/components/map-view";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

function YesNo({ value, good = true }: { value: boolean | null; good?: boolean }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const ok = value === good;
  return (
    <span className={cn("inline-flex items-center gap-1", ok ? "text-emerald-700" : "text-red-600")}>
      {value ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
      {value ? "Oui" : "Non"}
    </span>
  );
}

function CheckCard({ check, title }: { check: VehicleCheck | undefined; title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {check?.hasAnomaly && <Badge variant="destructive">Anomalie</Badge>}
        </CardTitle>
        {check && <CardDescription>{formatDateTime(check.createdAt)}</CardDescription>}
      </CardHeader>
      <CardContent>
        {!check ? (
          <p className="text-sm text-muted-foreground">Pas encore effectué.</p>
        ) : (
          <div className="grid gap-1">
            <InfoRow label="Kilométrage">{formatNumber(check.km)} km</InfoRow>
            <InfoRow label={check.kind === "return" ? "Camion nettoyé" : "Camion propre"}>
              <YesNo value={check.clean} />
            </InfoRow>
            {check.kind === "departure" && (
              <>
                <InfoRow label="Plein fait">
                  <YesNo value={check.fuelFull} />
                </InfoRow>
                <InfoRow label="Voyants allumés">
                  <YesNo value={check.warningLights} good={false} />
                </InfoRow>
                <InfoRow label="Groupe froid OK">
                  <YesNo value={check.fridgeOk} />
                </InfoRow>
              </>
            )}
            {check.temperature !== null && <InfoRow label="Température">{formatNumber(check.temperature)} °C</InfoRow>}
            {check.palettes !== null && <InfoRow label="Palettes">{check.palettes}</InfoRow>}
            {check.comment && <p className="mt-2 rounded-md bg-muted p-2 text-sm">« {check.comment} »</p>}
            <div className="mt-2">
              <PhotoGrid ids={[check.kmPhotoId, ...check.photoIds]} label="Photo du contrôle" size="size-16" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TourDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data: tour, isLoading } = useTour(id);
  const action = useTourAction();
  const history = useMutation({ mutationFn: () => api.get<GpsPoint[]>("/gps/history", { tourId: id }) });

  const markers = useMemo<MapMarker[]>(() => {
    if (!tour) return [];
    const m: MapMarker[] = tour.notes
      .filter((n) => (n.completedLat ?? n.arrivalLat) !== null && (n.completedLng ?? n.arrivalLng) !== null)
      .map((n) => ({
        id: n.id,
        lat: (n.completedLat ?? n.arrivalLat)!,
        lng: (n.completedLng ?? n.arrivalLng)!,
        label: `${n.sequence}. ${n.clientSnapshot.name}`,
        detail: n.completedAt ? `Terminé à ${formatTime(n.completedAt)}` : `Arrivé à ${formatTime(n.arrivedAt)}`,
        color: n.status === "failed" ? "#dc2626" : n.status === "partial" ? "#ea580c" : "#059669",
      }));
    if (tour.lastPosition) m.push({ id: "driver", lat: tour.lastPosition.lat, lng: tour.lastPosition.lng, label: "Position du chauffeur", detail: formatTime(tour.lastPosition.at), color: "#2563eb" });
    return m;
  }, [tour]);
  const track = useMemo(() => history.data?.map((p) => [p.lng, p.lat] as [number, number]), [history.data]);

  if (isLoading) return <Skeleton className="h-96" />;
  if (!tour) return <EmptyState title="Tournée introuvable" />;

  const departure = tour.checks.find((c) => c.kind === "departure");
  const ret = tour.checks.find((c) => c.kind === "return");
  const done = tour.notes.filter((n) => ["delivered", "partial", "failed"].includes(n.status)).length;
  const packages = tour.notes.reduce((s, n) => s + (n.packageCount ?? 0), 0);
  const weight = tour.notes.reduce((s, n) => s + Number(n.netWeightKg ?? 0), 0);
  const openIncidents = tour.incidents.filter((i) => i.status !== "closed");

  return (
    <div className="grid gap-4">
      <Link to="/tours" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Tournées
      </Link>
      <PageHeader
        title={tour.name}
        description={<span className="first-letter:uppercase">{formatDay(tour.date)}</span>}
        actions={
          <>
            <TourStatusBadge status={tour.status} className="h-6 px-2.5" />
            {can("tours.validate", tour.depotId) && tour.status === "draft" && (
              <Button size="sm" onClick={() => action.mutate({ id: tour.id, action: "validate" })}>
                <CheckIcon /> Valider
              </Button>
            )}
            {can("tours.validate", tour.depotId) && tour.status === "validated" && (
              <Button size="sm" variant="outline" onClick={() => action.mutate({ id: tour.id, action: "unvalidate" })}>
                <RotateCcwIcon /> Repasser en brouillon
              </Button>
            )}
            {can("tours.validate", tour.depotId) && tour.status === "returned" && (
              <ConfirmDialog
                title="Clôturer la tournée ?"
                description="Une tournée clôturée ne peut plus être modifiée."
                confirmLabel="Clôturer"
                onConfirm={() => action.mutate({ id: tour.id, action: "close" })}
                trigger={
                  <Button size="sm">
                    <LockIcon /> Clôturer
                  </Button>
                }
              />
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Équipage</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <InfoRow label="Chauffeur">{tour.driver ? fullName(tour.driver) : "Non affecté"}</InfoRow>
            <InfoRow label="Véhicule">{tour.vehicle ? `${tour.vehicle.plate} (${tour.vehicle.type})` : "—"}</InfoRow>
            <InfoRow label="Départ">{formatDateTime(tour.startedAt)}</InfoRow>
            <InfoRow label="Retour dépôt">{formatDateTime(tour.returnedAt)}</InfoRow>
            {departure && ret && <InfoRow label="Distance">{formatNumber(ret.km - departure.km)} km</InfoRow>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Avancement</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <InfoRow label="BL terminés">
              {done} / {tour.notes.length}
            </InfoRow>
            <InfoRow label="Colis">{packages}</InfoRow>
            <InfoRow label="Poids">{formatKg(weight)}</InfoRow>
            <InfoRow label="Incidents ouverts">
              <span className={openIncidents.length ? "text-red-600" : ""}>{openIncidents.length}</span>
            </InfoRow>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Validation</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <InfoRow label="Validée le">{formatDateTime(tour.validatedAt)}</InfoRow>
            <InfoRow label="Clôturée le">{formatDateTime(tour.closedAt)}</InfoRow>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CheckCard check={departure} title="Contrôle camion au départ" />
        <CheckCard check={ret} title="Contrôle camion au retour" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bons de livraison</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">#</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>BL</TableHead>
                <TableHead>Créneau</TableHead>
                <TableHead className="text-right">Colis</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Arrivée / fin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tour.notes.map((n) => {
                const incs = tour.incidents.filter((i) => i.deliveryNoteId === n.id);
                return (
                  <TableRow key={n.id}>
                    <TableCell className="pl-4 tabular-nums">{n.sequence}</TableCell>
                    <TableCell>
                      <Link to={`/deliveries/${n.id}`} className="font-medium hover:underline">
                        {n.clientSnapshot.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {n.clientSnapshot.postalCode} {n.clientSnapshot.city}
                        {n.comment && <MessageSquareTextIcon className="ml-1 inline size-3 text-amber-600" />}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{n.number}</TableCell>
                    <TableCell className="tabular-nums">{formatWindow(n.windowStart, n.windowEnd) ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{n.packageCount ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <DeliveryStatusBadge status={n.status} />
                        {incs.map((i) => (
                          <IncidentStatusBadge key={i.id} status={i.status} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatTime(n.arrivedAt)} → {formatTime(n.completedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(can("gps.history", tour.depotId) || markers.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Carte de la tournée</CardTitle>
            <CardDescription>Points de livraison{can("gps.history", tour.depotId) ? " et trace GPS (accès journalisé, PIN requis)" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {can("gps.history", tour.depotId) && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => history.mutate()} disabled={history.isPending}>
                  {history.isPending ? <Loader2Icon className="animate-spin" /> : <MapPinnedIcon />}
                  {history.data ? "Recharger la trace GPS" : "Afficher la trace GPS"}
                </Button>
                {history.data && <span className="text-sm text-muted-foreground">{history.data.length} points enregistrés</span>}
              </div>
            )}
            <MapView markers={markers} track={track} className="h-96" fitKey={`${tour.id}:${track?.length ?? 0}`} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
