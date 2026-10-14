import { Link, useNavigate } from "react-router";
import { AlertTriangleIcon, TruckIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTours } from "@/queries/ops";
import { formatDay, formatDayShort, formatKg } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
import { TourStatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export function ToursPage() {
  const { depotId, date } = useAuth();
  const { data, isLoading } = useTours({ depotId, date });
  const navigate = useNavigate();

  return (
    <div className="grid gap-4">
      <PageHeader title="Tournées" description={<span className="first-letter:uppercase">{formatDay(date)}</span>} />
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <EmptyState icon={<TruckIcon />} title="Aucune tournée ce jour-là">
          Les tournées se créent depuis le <Link to="/planning" className="underline">planning</Link>.
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Tournée</TableHead>
                <TableHead>Chauffeur</TableHead>
                <TableHead>Véhicule</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-44">Avancement</TableHead>
                <TableHead className="text-right">Colis / poids</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/tours/${t.id}`)}>
                  <TableCell className="tabular-nums">{formatDayShort(t.date)}</TableCell>
                  <TableCell>
                    <Link to={`/tours/${t.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell>{t.driverName ?? <span className="text-muted-foreground">Non affecté</span>}</TableCell>
                  <TableCell>
                    {t.vehicle ? (
                      <span>
                        {t.vehicle.plate} <span className="text-xs text-muted-foreground">{t.vehicle.type}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <TourStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={t.total ? (t.done / t.total) * 100 : 0} className="h-1.5" />
                      <span className="text-xs whitespace-nowrap tabular-nums">
                        {t.done}/{t.total}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {t.packages} · {formatKg(t.weightKg)}
                  </TableCell>
                  <TableCell className="text-right">
                    {t.openIncidents ? (
                      <Badge variant="destructive">
                        <AlertTriangleIcon /> {t.openIncidents}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
