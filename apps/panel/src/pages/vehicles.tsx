import { useState } from "react";
import { Loader2Icon, PencilIcon, PlusIcon, TruckIcon } from "lucide-react";
import { VEHICLE_TYPES, type VehicleType } from "@me/shared";
import { useAuth } from "@/lib/auth";
import { useSaveVehicle, useVehicles } from "@/queries/admin";
import type { Vehicle } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ToneBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format";

const TYPE_LABELS: Record<VehicleType, string> = { VL: "VL (véhicule léger)", PL: "PL (poids lourd)" };

export function VehiclesPage() {
  const { depotId, depot, can } = useAuth();
  const { data, isLoading } = useVehicles(depotId);
  const save = useSaveVehicle();
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const canManage = can("vehicles.manage");

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Véhicules"
        description={depot?.name}
        actions={
          canManage && (
            <Button onClick={() => setEditing("new")}>
              <PlusIcon /> Ajouter un véhicule
            </Button>
          )
        }
      />
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <EmptyState icon={<TruckIcon />} title="Aucun véhicule dans ce dépôt" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° de parc</TableHead>
                <TableHead>Plaque</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="text-right">Capacité</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((v) => (
                <TableRow key={v.id} className={v.isActive ? "" : "opacity-60"}>
                  <TableCell className="tabular-nums">{v.fleetNumber ?? "—"}</TableCell>
                  <TableCell className="font-medium tabular-nums">{v.plate}</TableCell>
                  <TableCell>
                    <ToneBadge tone={v.type === "PL" ? "blue" : "gray"}>{v.type}</ToneBadge>
                  </TableCell>
                  <TableCell>{v.label ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.capacityKg ? `${formatNumber(v.capacityKg)} kg` : "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={v.isActive}
                      disabled={!canManage}
                      onCheckedChange={(isActive) => save.mutate({ id: v.id, depotId: v.depotId, plate: v.plate, type: v.type, isActive })}
                      aria-label="Actif"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <Button size="icon-xs" variant="ghost" aria-label="Modifier" onClick={() => setEditing(v)}>
                        <PencilIcon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && depotId && <VehicleDialog vehicle={editing === "new" ? null : editing} depotId={depotId} onClose={() => setEditing(null)} />}
    </div>
  );
}

function VehicleDialog({ vehicle, depotId, onClose }: { vehicle: Vehicle | null; depotId: string; onClose: () => void }) {
  const save = useSaveVehicle();
  const [plate, setPlate] = useState(vehicle?.plate ?? "");
  const [fleetNumber, setFleetNumber] = useState(vehicle?.fleetNumber ?? "");
  const [type, setType] = useState<VehicleType>(vehicle?.type ?? "PL");
  const [label, setLabel] = useState(vehicle?.label ?? "");
  const [capacity, setCapacity] = useState(vehicle?.capacityKg ? String(vehicle.capacityKg) : "");
  const [isActive, setIsActive] = useState(vehicle?.isActive ?? true);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              {
                id: vehicle?.id,
                depotId: vehicle?.depotId ?? depotId,
                plate: plate.trim(),
                fleetNumber: fleetNumber.trim() || null,
                type,
                label: label.trim() || null,
                capacityKg: capacity ? Math.round(Number(capacity)) : null,
                isActive,
              },
              { onSuccess: onClose },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{vehicle ? `Véhicule ${vehicle.plate}` : "Nouveau véhicule"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="v-plate">Plaque</Label>
              <Input id="v-plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="AB-123-CD" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="v-fleet">N° de parc</Label>
              <Input id="v-fleet" value={fleetNumber} onChange={(e) => setFleetNumber(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as VehicleType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="v-cap">Capacité (kg)</Label>
              <Input id="v-cap" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="v-label">Libellé</Label>
              <Input id="v-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Porteur frigo 19 t" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="v-active" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="v-active">Véhicule actif</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={plate.trim().length < 2 || save.isPending}>
              {save.isPending && <Loader2Icon className="animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
