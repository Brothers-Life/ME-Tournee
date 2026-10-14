// Planning du jour : une colonne par tournée + « À répartir », glisser-déposer des BL (dnd-kit).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckIcon, ExternalLinkIcon, InboxIcon, Loader2Icon, MessageSquareTextIcon, MoreHorizontalIcon, PencilIcon, PlusIcon,
  RotateCcwIcon, SparklesIcon, Trash2Icon, PackageIcon, WeightIcon,
} from "lucide-react";
import type { TourStatus } from "@me/shared";
import { useAuth } from "@/lib/auth";
import { useAutoPlan, useCreateTour, useDeleteTour, useMoveNotes, usePlanning, useReorderTour, useTourAction, useUpdateTour } from "@/queries/ops";
import { useDrivers, useSectors, useVehicles } from "@/queries/admin";
import { formatDay, formatKg, formatWindow, toNumber } from "@/lib/format";
import type { PlanningNote, PlanningTour, Sector, User, Vehicle } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/page-header";
import { DeliveryStatusBadge, TourStatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const UNASSIGNED = "unassigned";
const NONE = "__none__";
type Columns = Record<string, string[]>;

/** Statuts de tournée dans lesquels on peut encore déplacer des BL. */
const EDITABLE: TourStatus[] = ["draft", "validated"];

function buildColumns(tours: PlanningTour[], unassigned: PlanningNote[]): Columns {
  const cols: Columns = { [UNASSIGNED]: unassigned.map((n) => n.id) };
  for (const t of tours) cols[t.id] = [...t.notes].sort((a, b) => a.sequence - b.sequence).map((n) => n.id);
  return cols;
}

export function PlanningPage() {
  const { depotId, date, can } = useAuth();
  const { data, isLoading, isFetching } = usePlanning(depotId, date);
  const canManage = can("tours.manage");
  const drivers = useDrivers(depotId, canManage || can("users.view"));
  const vehicles = useVehicles(depotId, can("vehicles.view"));
  const sectors = useSectors(depotId);
  const autoPlan = useAutoPlan();
  const move = useMoveNotes();
  const reorder = useReorderTour();
  const [creating, setCreating] = useState(false);

  // Index des BL et des tournées.
  const notesById = useMemo(() => {
    const m = new Map<string, PlanningNote>();
    for (const n of data?.unassigned ?? []) m.set(n.id, n);
    for (const t of data?.tours ?? []) for (const n of t.notes) m.set(n.id, n);
    return m;
  }, [data]);
  const toursById = useMemo(() => new Map((data?.tours ?? []).map((t) => [t.id, t])), [data]);

  // État local des colonnes, resynchronisé avec le serveur hors glisser-déposer.
  const [cols, setCols] = useState<Columns>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragStart = useRef<{ container: string; index: number } | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (!data || activeId || busy.current) return;
    setCols(buildColumns(data.tours, data.unassigned));
  }, [data, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnEditable = (colId: string) => colId === UNASSIGNED || EDITABLE.includes(toursById.get(colId)?.status ?? "closed");
  const noteDraggable = (n: PlanningNote, colId: string) => canManage && n.status === "pending" && columnEditable(colId);

  const findContainer = (id: UniqueIdentifier): string | undefined => {
    const key = String(id);
    if (key in cols) return key;
    return Object.keys(cols).find((c) => cols[c]!.includes(key));
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const c = findContainer(active.id);
    if (!c) return;
    setActiveId(String(active.id));
    dragStart.current = { container: c, index: cols[c]!.indexOf(String(active.id)) };
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (!from || !to || from === to || !columnEditable(to)) return;
    setCols((prev) => {
      const fromItems = prev[from]!;
      const toItems = prev[to]!;
      const overKey = String(over.id);
      const overIndex = toItems.indexOf(overKey);
      const index = overKey in prev || overIndex < 0 ? toItems.length : overIndex;
      return {
        ...prev,
        [from]: fromItems.filter((x) => x !== String(active.id)),
        [to]: [...toItems.slice(0, index), String(active.id), ...toItems.slice(index)],
      };
    });
  };

  const resetFromServer = () => data && setCols(buildColumns(data.tours, data.unassigned));

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const start = dragStart.current;
    dragStart.current = null;
    const container = findContainer(id);
    if (!over || !container || !start) {
      setActiveId(null);
      resetFromServer();
      return;
    }
    let next = cols;
    const overContainer = findContainer(over.id);
    if (overContainer === container) {
      const items = cols[container]!;
      const oldIndex = items.indexOf(id);
      const newIndex = String(over.id) in cols ? items.length - 1 : items.indexOf(String(over.id));
      if (newIndex >= 0 && oldIndex !== newIndex) next = { ...cols, [container]: arrayMove(items, oldIndex, newIndex) };
    }
    setCols(next);
    setActiveId(null);

    const moved = container !== start.container;
    const reordered = !moved && next[container]!.indexOf(id) !== start.index;
    if (!moved && !reordered) return;
    busy.current = true;
    try {
      if (moved) await move.mutateAsync({ noteIds: [id], tourId: container === UNASSIGNED ? null : container });
      if (container !== UNASSIGNED) await reorder.mutateAsync({ tourId: container, noteIds: next[container]! });
    } catch {
      busy.current = false;
      resetFromServer();
      return;
    }
    busy.current = false;
  };

  const activeNote = activeId ? notesById.get(activeId) : undefined;
  const tours = data?.tours ?? [];
  const totalNotes = notesById.size;

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader
        title="Planning"
        description={
          <span className="first-letter:uppercase">
            {formatDay(date)} · {totalNotes} BL · {tours.length} tournée{tours.length > 1 ? "s" : ""}
            {isFetching && <Loader2Icon className="ml-2 inline size-3 animate-spin" />}
          </span>
        }
        actions={
          canManage && (
            <>
              {/* Un bouton désactivé n'affiche pas de bulle : l'explication est portée par le span. */}
              <span
                title={
                  data?.unassigned.length
                    ? "Range les BL « À répartir » dans la tournée de leur secteur"
                    : "Aucun BL à répartir : à l'import, chaque BL est déjà placé dans la tournée de son secteur"
                }
              >
                <Button
                  variant="outline"
                  onClick={() => depotId && autoPlan.mutate({ depotId, date })}
                  disabled={autoPlan.isPending || !data?.unassigned.length}
                >
                  {autoPlan.isPending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  Répartir automatiquement
                </Button>
              </span>
              <Button onClick={() => setCreating(true)}>
                <PlusIcon /> Nouvelle tournée
              </Button>
            </>
          )
        }
      />

      {isLoading ? (
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      ) : !totalNotes && !tours.length ? (
        <EmptyState icon={<InboxIcon />} title="Aucun BL pour cette journée">
          Importez le PDF du jour depuis la page Imports, ou choisissez une autre date.
        </EmptyState>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); resetFromServer(); }}>
          <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
            <div className="flex items-start gap-3" data-testid="planning-board">
              <Column
                id={UNASSIGNED}
                title="À répartir"
                noteIds={cols[UNASSIGNED] ?? []}
                notesById={notesById}
                isDraggable={(n) => noteDraggable(n, UNASSIGNED)}
                locked={false}
              />
              {tours.map((t) => (
                <Column
                  key={t.id}
                  id={t.id}
                  tour={t}
                  noteIds={cols[t.id] ?? []}
                  notesById={notesById}
                  isDraggable={(n) => noteDraggable(n, t.id)}
                  locked={!columnEditable(t.id)}
                  drivers={drivers.data ?? []}
                  vehicles={vehicles.data ?? []}
                  sector={sectors.data?.find((s) => s.id === t.sectorId)}
                />
              ))}
            </div>
          </div>
          <DragOverlay>{activeNote ? <NoteCard note={activeNote} overlay /> : null}</DragOverlay>
        </DndContext>
      )}

      {creating && depotId && <NewTourDialog depotId={depotId} date={date} sectors={sectors.data ?? []} count={tours.length} onClose={() => setCreating(false)} />}
    </div>
  );
}

// ---------- Colonne ----------

function Column({
  id, title, tour, noteIds, notesById, isDraggable, locked, drivers = [], vehicles = [], sector,
}: {
  id: string;
  title?: string;
  tour?: PlanningTour;
  noteIds: string[];
  notesById: Map<string, PlanningNote>;
  isDraggable: (n: PlanningNote) => boolean;
  locked: boolean;
  drivers?: User[];
  vehicles?: Vehicle[];
  sector?: Sector;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: locked });
  const notes = noteIds.map((nid) => notesById.get(nid)).filter((n): n is PlanningNote => !!n);
  const packages = notes.reduce((s, n) => s + (n.packageCount ?? 0), 0);
  const weight = notes.reduce((s, n) => s + (toNumber(n.netWeightKg) ?? 0), 0);

  return (
    <section
      className={cn("flex max-h-[calc(100svh-11rem)] w-72 shrink-0 flex-col rounded-lg border bg-muted/40", !tour && "bg-muted/70")}
      style={sector ? { borderTopColor: sector.color, borderTopWidth: 3 } : undefined}
      data-testid={`column-${tour ? tour.name : "unassigned"}`}
      data-column-id={id}
    >
      {tour ? (
        <TourHeader tour={tour} drivers={drivers} vehicles={vehicles} count={notes.length} packages={packages} weight={weight} />
      ) : (
        <div className="border-b p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{title}</h2>
            <Badge variant="secondary">{notes.length}</Badge>
          </div>
          <Totals count={notes.length} packages={packages} weight={weight} />
        </div>
      )}
      <SortableContext id={id} items={noteIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn("flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors", isOver && "bg-primary/5")}>
          {notes.map((n) => (
            <SortableNote key={n.id} note={n} draggable={isDraggable(n)} lockedColumn={locked} />
          ))}
          {!notes.length && <p className="py-6 text-center text-xs text-muted-foreground">{locked ? "Aucun BL" : "Déposez des BL ici"}</p>}
        </div>
      </SortableContext>
    </section>
  );
}

function Totals({ count, packages, weight }: { count: number; packages: number; weight: number }) {
  return (
    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
      <span>{count} BL</span>
      <span className="inline-flex items-center gap-1">
        <PackageIcon className="size-3" /> {packages} colis
      </span>
      <span className="inline-flex items-center gap-1">
        <WeightIcon className="size-3" /> {formatKg(weight)}
      </span>
    </div>
  );
}

function TourHeader({ tour, drivers, vehicles, count, packages, weight }: { tour: PlanningTour; drivers: User[]; vehicles: Vehicle[]; count: number; packages: number; weight: number }) {
  const { can } = useAuth();
  const update = useUpdateTour();
  const action = useTourAction();
  const del = useDeleteTour();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(tour.name);
  useEffect(() => setName(tour.name), [tour.name]);
  const editable = can("tours.manage") && EDITABLE.includes(tour.status);
  const vehicle = vehicles.find((v) => v.id === tour.vehicleId);
  const driverKnown = drivers.some((d) => d.id === tour.driverId);

  const saveName = () => {
    setEditing(false);
    const v = name.trim();
    if (v && v !== tour.name) update.mutate({ id: tour.id, name: v });
    else setName(tour.name);
  };

  return (
    <div className="grid gap-2 border-b p-3">
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setName(tour.name);
                setEditing(false);
              }
            }}
            className="h-7"
            aria-label="Nom de la tournée"
          />
        ) : (
          <button
            type="button"
            className={cn("group min-w-0 text-left font-semibold", editable && "cursor-text")}
            onClick={() => editable && setEditing(true)}
            title={editable ? "Renommer" : undefined}
          >
            <span className="line-clamp-2">{tour.name}</span>
            {editable && <PencilIcon className="ml-1 inline size-3 opacity-0 group-hover:opacity-60" />}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Actions de la tournée">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/tours/${tour.id}`}>
                <ExternalLinkIcon /> Voir le détail
              </Link>
            </DropdownMenuItem>
            {editable && (
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <PencilIcon /> Renommer
              </DropdownMenuItem>
            )}
            {can("tours.delete") && EDITABLE.includes(tour.status) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2Icon /> Supprimer
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Supprimer « ${tour.name} » ?`}
          description="Les BL de cette tournée repasseront dans « À répartir ». Votre code PIN sera demandé."
          confirmLabel="Supprimer"
          destructive
          onConfirm={() => del.mutate(tour.id)}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <TourStatusBadge status={tour.status} />
        {can("tours.validate") && tour.status === "draft" && (
          <Button size="xs" onClick={() => action.mutate({ id: tour.id, action: "validate" })} disabled={action.isPending}>
            <CheckIcon /> Valider
          </Button>
        )}
        {can("tours.validate") && tour.status === "validated" && (
          <Button size="xs" variant="outline" onClick={() => action.mutate({ id: tour.id, action: "unvalidate" })} disabled={action.isPending}>
            <RotateCcwIcon /> Repasser en brouillon
          </Button>
        )}
      </div>

      <Select
        value={tour.driverId ?? NONE}
        onValueChange={(v) => update.mutate({ id: tour.id, driverId: v === NONE ? null : v })}
        disabled={!editable}
      >
        <SelectTrigger size="sm" className="w-full bg-background" aria-label="Chauffeur">
          <SelectValue placeholder="Chauffeur" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={NONE}>Aucun chauffeur</SelectItem>
          {tour.driverId && !driverKnown && <SelectItem value={tour.driverId}>Chauffeur affecté</SelectItem>}
          {drivers.map((d) => (
            <SelectItem key={d.id} value={d.id} disabled={!d.isActive}>
              {d.firstName} {d.lastName}
              {d.login ? ` (${d.login})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={tour.vehicleId ?? NONE}
        onValueChange={(v) => update.mutate({ id: tour.id, vehicleId: v === NONE ? null : v })}
        disabled={!editable}
      >
        <SelectTrigger size="sm" className="w-full bg-background" aria-label="Véhicule">
          <SelectValue placeholder="Véhicule" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={NONE}>Aucun véhicule</SelectItem>
          {tour.vehicleId && !vehicle && <SelectItem value={tour.vehicleId}>Véhicule affecté</SelectItem>}
          {vehicles.map((v) => (
            <SelectItem key={v.id} value={v.id} disabled={!v.isActive}>
              {v.fleetNumber ? `n°${v.fleetNumber} · ` : ""}
              {v.plate} ({v.type})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Totals count={count} packages={packages} weight={weight} />
      {vehicle?.capacityKg && weight > vehicle.capacityKg && (
        <p className="text-xs font-medium text-destructive">Capacité du véhicule dépassée ({formatKg(vehicle.capacityKg)})</p>
      )}
    </div>
  );
}

// ---------- Cartes BL ----------

function SortableNote({ note, draggable, lockedColumn }: { note: PlanningNote; draggable: boolean; lockedColumn: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
    disabled: { draggable: !draggable, droppable: lockedColumn },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <NoteCard note={note} draggable={draggable} />
    </div>
  );
}

function NoteCard({ note, draggable = true, overlay }: { note: PlanningNote; draggable?: boolean; overlay?: boolean }) {
  const slot = formatWindow(note.windowStart, note.windowEnd);
  return (
    <div
      className={cn(
        "rounded-md border bg-background p-2 text-sm shadow-xs",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default opacity-90",
        overlay && "rotate-1 shadow-lg",
      )}
      data-testid="note-card"
      data-note-id={note.id}
    >
      <div className="flex items-start justify-between gap-2">
        <Link to={`/deliveries/${note.id}`} className="min-w-0 font-medium leading-tight hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          <span className="line-clamp-2">{note.client.name}</span>
        </Link>
        {note.comment && (
          <Tooltip>
            <TooltipTrigger asChild>
              <MessageSquareTextIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-label="Commentaire" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{note.comment}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">
        {note.client.postalCode} {note.client.city}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {slot && <span className="rounded bg-muted px-1 font-medium tabular-nums">{slot}</span>}
        <span className="tabular-nums">{note.packageCount ?? "?"} colis</span>
        <span className="text-muted-foreground tabular-nums">{formatKg(note.netWeightKg)}</span>
        {note.pickupRequested && (
          <Badge variant="outline" className="border-violet-300 text-violet-700">
            Reprise
          </Badge>
        )}
        {note.status !== "pending" && <DeliveryStatusBadge status={note.status} />}
      </div>
    </div>
  );
}

// ---------- Nouvelle tournée ----------

function NewTourDialog({ depotId, date, sectors, count, onClose }: { depotId: string; date: string; sectors: Sector[]; count: number; onClose: () => void }) {
  const create = useCreateTour();
  const [name, setName] = useState(`Tournée ${count + 1}`);
  const [sectorId, setSectorId] = useState<string>(NONE);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              { depotId, date, name: name.trim(), sectorId: sectorId === NONE ? null : sectorId },
              { onSuccess: onClose },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Nouvelle tournée</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="tour-name">Nom</Label>
            <Input id="tour-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label>Secteur</Label>
            <Select
              value={sectorId}
              onValueChange={(v) => {
                setSectorId(v);
                const s = sectors.find((x) => x.id === v);
                if (s && (!name.trim() || name.startsWith("Tournée "))) setName(s.name);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucun secteur</SelectItem>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending && <Loader2Icon className="animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
