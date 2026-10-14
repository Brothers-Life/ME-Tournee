import { useState } from "react";
import { Loader2Icon, MapIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useDeleteSector, useDrivers, useSaveSector, useSectors, useVehicles } from "@/queries/admin";
import type { Sector, User, Vehicle } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const NONE = "__none__";
const splitList = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

export function SectorsPage() {
  const { depotId, depot } = useAuth();
  const { data, isLoading } = useSectors(depotId);
  const drivers = useDrivers(depotId);
  const vehicles = useVehicles(depotId);
  const del = useDeleteSector();
  const [editing, setEditing] = useState<Sector | "new" | null>(null);
  const driverName = (id: string | null) => {
    const u = drivers.data?.find((d) => d.id === id);
    return u ? `${u.firstName} ${u.lastName}` : "—";
  };
  const vehicleName = (id: string | null) => vehicles.data?.find((v) => v.id === id)?.plate ?? "—";

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Secteurs"
        description={`Zones de livraison utilisées par la répartition automatique · ${depot?.name ?? ""}`}
        actions={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon /> Nouveau secteur
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <EmptyState icon={<MapIcon />} title="Aucun secteur" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Ordre</TableHead>
                <TableHead>Secteur</TableHead>
                <TableHead>Codes postaux</TableHead>
                <TableHead>Villes</TableHead>
                <TableHead>Chauffeur par défaut</TableHead>
                <TableHead>Véhicule par défaut</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="tabular-nums">{s.sortOrder}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span className="size-3 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-72">
                    <div className="flex flex-wrap gap-1">
                      {s.postalCodes.map((p) => (
                        <Badge key={p} variant="secondary" className="tabular-nums">
                          {p}
                          {p.length < 5 ? "…" : ""}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-56 text-sm whitespace-normal">{s.cities.join(", ") || "—"}</TableCell>
                  <TableCell>{driverName(s.defaultDriverId)}</TableCell>
                  <TableCell>{vehicleName(s.defaultVehicleId)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon-xs" variant="ghost" aria-label="Modifier" onClick={() => setEditing(s)}>
                        <PencilIcon />
                      </Button>
                      <ConfirmDialog
                        title={`Supprimer le secteur « ${s.name} » ?`}
                        description="Les clients rattachés à ce secteur n'en auront plus."
                        confirmLabel="Supprimer"
                        destructive
                        onConfirm={() => del.mutate(s.id)}
                        trigger={
                          <Button size="icon-xs" variant="ghost" aria-label="Supprimer">
                            <Trash2Icon />
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && depotId && (
        <SectorDialog
          sector={editing === "new" ? null : editing}
          depotId={depotId}
          nextOrder={(data?.length ?? 0) + 1}
          drivers={drivers.data ?? []}
          vehicles={vehicles.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SectorDialog({
  sector, depotId, nextOrder, drivers, vehicles, onClose,
}: {
  sector: Sector | null;
  depotId: string;
  nextOrder: number;
  drivers: User[];
  vehicles: Vehicle[];
  onClose: () => void;
}) {
  const save = useSaveSector();
  const [name, setName] = useState(sector?.name ?? "");
  const [color, setColor] = useState(sector?.color ?? "#2f6fae");
  const [postalCodes, setPostalCodes] = useState(sector?.postalCodes.join(", ") ?? "");
  const [cities, setCities] = useState(sector?.cities.join(", ") ?? "");
  const [driverId, setDriverId] = useState(sector?.defaultDriverId ?? NONE);
  const [vehicleId, setVehicleId] = useState(sector?.defaultVehicleId ?? NONE);
  const [sortOrder, setSortOrder] = useState(String(sector?.sortOrder ?? nextOrder));
  const codes = splitList(postalCodes);
  const invalidCodes = codes.filter((c) => !/^\d{2,5}$/.test(c));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              {
                id: sector?.id,
                depotId,
                name: name.trim(),
                color,
                postalCodes: codes,
                cities: splitList(cities).map((c) => c.toUpperCase()),
                defaultDriverId: driverId === NONE ? null : driverId,
                defaultVehicleId: vehicleId === NONE ? null : vehicleId,
                sortOrder: Number(sortOrder) || 0,
              },
              { onSuccess: onClose },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{sector ? `Secteur ${sector.name}` : "Nouveau secteur"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_auto_5rem] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="s-name">Nom</Label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-color">Couleur</Label>
              <Input id="s-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-14 p-1" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-order">Ordre</Label>
              <Input id="s-order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-codes">Codes postaux ou préfixes</Label>
            <Input id="s-codes" value={postalCodes} onChange={(e) => setPostalCodes(e.target.value)} placeholder="33260, 33280, 331" />
            <p className={invalidCodes.length ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {invalidCodes.length ? `Invalides : ${invalidCodes.join(", ")} (2 à 5 chiffres)` : "Séparés par des virgules. « 331 » couvre tous les codes commençant par 331."}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-cities">Villes</Label>
            <Input id="s-cities" value={cities} onChange={(e) => setCities(e.target.value)} placeholder="Arcachon, La Teste-de-Buch" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Chauffeur par défaut</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucun</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.firstName} {d.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Véhicule par défaut</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucun</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plate} ({v.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim() || invalidCodes.length > 0 || save.isPending}>
              {save.isPending && <Loader2Icon className="animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
