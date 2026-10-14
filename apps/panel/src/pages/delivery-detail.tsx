import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeftIcon, CheckCircle2Icon, CircleDashedIcon, MessageSquareTextIcon, PhoneIcon, MessageCircleIcon, AlertCircleIcon, RecycleIcon } from "lucide-react";
import { formatPhone } from "@me/shared";
import { useDelivery } from "@/queries/ops";
import { useIncidentTypeLabel } from "@/queries/admin";
import { formatDateTime, formatDay, formatDayShort, formatKg, formatNumber, formatQty, formatTime, formatWindow } from "@/lib/format";
import type { DeliveryLine } from "@/lib/types";
import { PageHeader, InfoRow, EmptyState } from "@/components/page-header";
import { DeliveryStatusBadge, IncidentStatusBadge } from "@/components/status-badge";
import { PhotoGrid } from "@/components/auth-image";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CHECK_LABEL: Record<DeliveryLine["checkStatus"], React.ReactNode> = {
  unchecked: (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <CircleDashedIcon className="size-3.5" /> Non pointé
    </span>
  ),
  ok: (
    <span className="inline-flex items-center gap-1 text-emerald-700">
      <CheckCircle2Icon className="size-3.5" /> OK
    </span>
  ),
  issue: (
    <span className="inline-flex items-center gap-1 text-red-600">
      <AlertCircleIcon className="size-3.5" /> Incident
    </span>
  ),
};

export function DeliveryDetailPage() {
  const { id } = useParams();
  const { data: d, isLoading } = useDelivery(id);
  const typeLabel = useIncidentTypeLabel();

  const groups = useMemo(() => {
    const m = new Map<string, DeliveryLine[]>();
    for (const l of d?.lines ?? []) m.set(l.category, [...(m.get(l.category) ?? []), l]);
    return [...m.entries()];
  }, [d]);

  if (isLoading) return <Skeleton className="h-96" />;
  if (!d) return <EmptyState title="BL introuvable" />;
  const slot = formatWindow(d.windowStart, d.windowEnd);
  const lineById = new Map(d.lines.map((l) => [l.id, l]));

  return (
    <div className="grid gap-4">
      <Link to={d.tourId ? `/tours/${d.tourId}` : "/deliveries"} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> {d.tourId ? "Tournée" : "Livraisons"}
      </Link>
      <PageHeader
        title={d.client.name}
        description={
          <span>
            BL n° {d.number} · <span className="first-letter:uppercase">{formatDay(d.deliveryDate)}</span>
          </span>
        }
        actions={<DeliveryStatusBadge status={d.status} className="h-6 px-2.5" />}
      />

      {d.comment && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <MessageSquareTextIcon />
          <AlertTitle>Commentaire du BL</AlertTitle>
          <AlertDescription className="text-base font-medium text-amber-950 dark:text-amber-100">{d.comment}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
            <CardDescription>Code {d.client.code}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {d.clientSnapshot.addressLines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
            <div>
              {d.clientSnapshot.postalCode} {d.clientSnapshot.city}
            </div>
            <div className="mt-2 grid gap-1">
              {d.client.phones.length ? (
                d.client.phones.map((p) => (
                  <a key={p} href={`tel:${p}`} className="inline-flex items-center gap-1.5 font-medium tabular-nums hover:underline">
                    <PhoneIcon className="size-3.5" /> {formatPhone(p)}
                  </a>
                ))
              ) : (
                <span className="text-muted-foreground">Coordonnées masquées ou absentes</span>
              )}
            </div>
            {d.client.notes && <p className="mt-2 rounded-md bg-muted p-2">{d.client.notes}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Livraison</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <InfoRow label="Créneau">{slot ?? "—"}</InfoRow>
            <InfoRow label="Colis">{d.packageCount ?? "—"}</InfoRow>
            <InfoRow label="Poids net">{formatKg(d.netWeightKg)}</InfoRow>
            <InfoRow label="Arrivée">{formatTime(d.arrivedAt)}</InfoRow>
            <InfoRow label="Fin">{formatTime(d.completedAt)}</InfoRow>
            {d.temperature !== null && <InfoRow label="Température">{formatNumber(d.temperature)} °C</InfoRow>}
            {d.pickupRequested && (
              <InfoRow label="Reprise">
                <Badge variant="outline" className="border-violet-300 text-violet-700">
                  Demandée
                </Badge>
              </InfoRow>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Commande</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <InfoRow label="N° de commande">{d.orderNumber ?? "—"}</InfoRow>
            <InfoRow label="Date de commande">{formatDayShort(d.orderDate)}</InfoRow>
            <InfoRow label="Transporteur">{d.carrier ?? "—"}</InfoRow>
            <InfoRow label="Page du PDF">{d.sourcePage ?? "—"}</InfoRow>
            {d.client.emailSignedBl && <InfoRow label="BL signé">envoyé par mail</InfoRow>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Articles</CardTitle>
          <CardDescription>{d.lines.length} ligne(s)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 px-0">
          {groups.map(([category, lines]) => (
            <div key={category}>
              <div className="bg-muted/60 px-4 py-1.5 text-xs font-semibold tracking-wide uppercase">{category}</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Code</TableHead>
                    <TableHead>Désignation</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Poids</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>DLC</TableHead>
                    <TableHead>Pointage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="pl-4 tabular-nums">{l.articleCode}</TableCell>
                      <TableCell className="max-w-80 whitespace-normal">{l.designation}</TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{l.ean ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQty(l.quantity)} {l.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatKg(l.weightKg)}</TableCell>
                      <TableCell className="tabular-nums">{l.lotNumber ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{formatDayShort(l.dlc)}</TableCell>
                      <TableCell>{CHECK_LABEL[l.checkStatus]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Incidents</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {!d.incidents.length ? (
              <p className="text-sm text-muted-foreground">Aucun incident.</p>
            ) : (
              d.incidents.map((i) => {
                const line = i.lineId ? lineById.get(i.lineId) : undefined;
                return (
                  <div key={i.id} className="grid gap-2 rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{typeLabel(i.type)}</span>
                      <IncidentStatusBadge status={i.status} />
                    </div>
                    {line && (
                      <div className="text-muted-foreground">
                        {line.articleCode} · {line.designation}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {i.quantity !== null && <span>Quantité : {formatQty(i.quantity)}</span>}
                      {i.action && <span>Action : {i.action}</span>}
                      <span className="text-muted-foreground">{formatDateTime(i.createdAt)}</span>
                    </div>
                    {i.comment && <p className="rounded bg-muted p-2">« {i.comment} »</p>}
                    {i.handledComment && <p className="text-muted-foreground">Traitement : {i.handledComment}</p>}
                    <PhotoGrid ids={i.photoIds} label="Photo de l'incident" size="size-16" />
                  </div>
                );
              })
            )}
            <Link to="/incidents" className="text-sm text-muted-foreground hover:underline">
              Tous les incidents
            </Link>
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>BL signé</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <InfoRow label="Signataire">{d.signerName ?? "—"}</InfoRow>
              {d.signedBlPhotoId ? <PhotoGrid ids={[d.signedBlPhotoId]} label="BL signé" size="size-32" /> : <p className="text-muted-foreground">Pas de photo du BL signé.</p>}
              {d.driverComment && <p className="rounded bg-muted p-2">Chauffeur : « {d.driverComment} »</p>}
            </CardContent>
          </Card>

          {(d.pickup || d.pickupRequested) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RecycleIcon className="size-4" /> Reprise
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {!d.pickup ? (
                  <p className="text-muted-foreground">Demandée, pas encore effectuée.</p>
                ) : (
                  <>
                    <InfoRow label="Effectuée">{d.pickup.done ? "Oui" : "Non"}</InfoRow>
                    {d.pickup.quantity !== null && <InfoRow label="Quantité">{formatQty(d.pickup.quantity)}</InfoRow>}
                    {d.pickup.comment && <p className="rounded bg-muted p-2">« {d.pickup.comment} »</p>}
                    <PhotoGrid ids={d.pickup.photoIds} label="Photo de la reprise" size="size-16" />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Appels et SMS</CardTitle>
            </CardHeader>
            <CardContent>
              {!d.communications.length ? (
                <p className="text-sm text-muted-foreground">Aucun appel ni SMS.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {d.communications.map((c) => (
                    <li key={c.id} className="flex gap-2">
                      {c.kind === "call" ? <PhoneIcon className="mt-0.5 size-4 shrink-0" /> : <MessageCircleIcon className="mt-0.5 size-4 shrink-0" />}
                      <div>
                        <div>
                          {c.kind === "call" ? "Appel" : "SMS"} {c.to && <>vers {formatPhone(c.to)}</>}{" "}
                          <span className="text-muted-foreground">· {formatDateTime(c.createdAt)}</span>
                        </div>
                        {c.body && <div className="text-muted-foreground">« {c.body} »</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
