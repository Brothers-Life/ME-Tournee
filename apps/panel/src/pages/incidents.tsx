import { useState } from "react";
import { Link } from "react-router";
import { AlertTriangleIcon, CheckIcon, HandIcon, Loader2Icon } from "lucide-react";
import { INCIDENT_STATUSES, INCIDENT_STATUS_LABELS, type IncidentStatus } from "@me/shared";
import { useAuth } from "@/lib/auth";
import { useIncidents, useUpdateIncident } from "@/queries/ops";
import { useIncidentTypeLabel } from "@/queries/admin";
import { formatDateTime, formatDayShort, formatQty } from "@/lib/format";
import type { IncidentListItem } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/page-header";
import { IncidentStatusBadge } from "@/components/status-badge";
import { PhotoGrid } from "@/components/auth-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Filter = IncidentStatus | "open" | "all";

export function IncidentsPage() {
  const { depotId, can } = useAuth();
  const [filter, setFilter] = useState<Filter>("open");
  const { data, isLoading } = useIncidents({ depotId, status: filter === "open" || filter === "all" ? undefined : filter });
  const typeLabel = useIncidentTypeLabel();
  const [editing, setEditing] = useState<{ incident: IncidentListItem; status: IncidentStatus } | null>(null);
  const canManage = can("incidents.manage");
  const rows = filter === "open" ? data?.filter((i) => i.status !== "closed") : data;

  return (
    <div className="grid gap-4">
      <PageHeader title="Incidents" description="Signalés par les chauffeurs lors des livraisons" />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="open">À traiter</TabsTrigger>
          {INCIDENT_STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {INCIDENT_STATUS_LABELS[s]}
            </TabsTrigger>
          ))}
          <TabsTrigger value="all">Tous</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !rows?.length ? (
        <EmptyState icon={<AlertTriangleIcon />} title="Aucun incident" />
      ) : (
        <div className="grid gap-3">
          {rows.map((i) => (
            <Card key={i.id} className="py-4">
              <CardContent className="grid gap-3 px-4 md:grid-cols-[1fr_auto]">
                <div className="grid gap-1.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{typeLabel(i.type)}</span>
                    <IncidentStatusBadge status={i.status} />
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(i.createdAt)}
                      {i.createdByName && ` · ${i.createdByName}`}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">{i.note.client.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {i.note.client.city} · BL{" "}
                      <Link to={`/deliveries/${i.note.id}`} className="underline-offset-4 hover:underline">
                        {i.note.number}
                      </Link>{" "}
                      du {formatDayShort(i.note.deliveryDate)}
                    </span>
                  </div>
                  {i.line && (
                    <div className="text-muted-foreground">
                      Produit : {i.line.articleCode} · {i.line.designation} ({formatQty(i.line.quantity)} {i.line.unit})
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4">
                    {i.quantity !== null && <span>Quantité concernée : {formatQty(i.quantity)}</span>}
                    {i.action && <span>Action : {i.action}</span>}
                  </div>
                  {i.comment && <p className="rounded bg-muted p-2">« {i.comment} »</p>}
                  {i.handledComment && (
                    <p className="text-muted-foreground">
                      Traitement : {i.handledComment}
                      {i.handledAt && ` (${formatDateTime(i.handledAt)})`}
                    </p>
                  )}
                  <PhotoGrid ids={i.photoIds} label="Photo de l'incident" size="size-16" />
                </div>
                {canManage && i.status !== "closed" && (
                  <div className="flex items-start gap-2 md:flex-col">
                    {i.status === "new" && (
                      <Button size="sm" variant="outline" onClick={() => setEditing({ incident: i, status: "in_progress" })}>
                        <HandIcon /> Prendre en charge
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setEditing({ incident: i, status: "closed" })}>
                      <CheckIcon /> Clôturer
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && <HandleDialog incident={editing.incident} status={editing.status} onClose={() => setEditing(null)} />}
    </div>
  );
}

function HandleDialog({ incident, status, onClose }: { incident: IncidentListItem; status: IncidentStatus; onClose: () => void }) {
  const update = useUpdateIncident();
  const [comment, setComment] = useState(incident.handledComment ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ id: incident.id, status, handledComment: comment.trim() || null }, { onSuccess: onClose });
          }}
        >
          <DialogHeader>
            <DialogTitle>{status === "closed" ? "Clôturer l'incident" : "Prendre en charge l'incident"}</DialogTitle>
            <DialogDescription>
              {incident.note.client.name} · BL {incident.note.number}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="handled-comment">Commentaire</Label>
            <Textarea
              id="handled-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={status === "closed" ? "Avoir émis, produit relivré…" : "Client rappelé, en attente…"}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Loader2Icon className="animate-spin" />}
              {status === "closed" ? "Clôturer" : "Prendre en charge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
