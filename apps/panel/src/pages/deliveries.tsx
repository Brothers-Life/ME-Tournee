import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { PackageIcon, SearchIcon } from "lucide-react";
import { DELIVERY_STATUSES, DELIVERY_STATUS_LABELS } from "@me/shared";
import { useAuth } from "@/lib/auth";
import { useDeliveries } from "@/queries/ops";
import { useDebounced } from "@/hooks/use-debounced";
import { formatDay, formatDayShort, formatTime, formatWindow } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
import { DeliveryStatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const ALL = "all";

export function DeliveriesPage() {
  const { depotId, date } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [allDates, setAllDates] = useState(false);
  const q = useDebounced(search.trim(), 300);
  const { data, isLoading } = useDeliveries({ depotId, date: allDates ? undefined : date, status: status === ALL ? undefined : status, search: q || undefined });
  const navigate = useNavigate();

  return (
    <div className="grid gap-4">
      <PageHeader title="Livraisons" description={allDates ? "Toutes les dates" : <span className="first-letter:uppercase">{formatDay(date)}</span>} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="N° de BL ou client…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" aria-label="Statut">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les statuts</SelectItem>
            {DELIVERY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {DELIVERY_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="all-dates" checked={allDates} onCheckedChange={setAllDates} />
          <Label htmlFor="all-dates">Toutes les dates</Label>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <EmptyState icon={<PackageIcon />} title="Aucune livraison trouvée" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>BL</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Créneau</TableHead>
                <TableHead>Tournée</TableHead>
                <TableHead className="text-right">Colis</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Terminé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/deliveries/${d.id}`)}>
                  <TableCell className="tabular-nums">{formatDayShort(d.deliveryDate)}</TableCell>
                  <TableCell className="tabular-nums">
                    <Link to={`/deliveries/${d.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {d.number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{d.client.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.client.postalCode} {d.client.city}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatWindow(d.windowStart, d.windowEnd) ?? "—"}</TableCell>
                  <TableCell>{d.tourName ?? <span className="text-muted-foreground">Non affecté</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.packageCount ?? "—"}</TableCell>
                  <TableCell>
                    <DeliveryStatusBadge status={d.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">{d.completedAt ? formatTime(d.completedAt) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
