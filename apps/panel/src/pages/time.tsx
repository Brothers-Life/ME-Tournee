import { useMemo, useState } from "react";
import { startOfWeek, format, parseISO } from "date-fns";
import { ClockIcon, DownloadIcon, Loader2Icon, PencilIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, downloadBlob } from "@/lib/api";
import { useCorrectTimeEntry, useTimeEntries } from "@/queries/ops";
import { formatDayShort, formatMinutes, formatOffset, formatTime, fromParisLocalInput, toParisLocalInput, todayParis } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiMutation } from "@/lib/query-client";
import { cn } from "@/lib/utils";

export function TimePage() {
  const { depotId, can } = useAuth();
  const [from, setFrom] = useState(() => format(startOfWeek(parseISO(todayParis()), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [to, setTo] = useState(todayParis());
  const valid = !!from && !!to && from <= to;
  const { data, isLoading } = useTimeEntries({ depotId, from: valid ? from : todayParis(), to: valid ? to : todayParis() });
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const exportCsv = useApiMutation(async () => {
    const blob = await api.blob("/time-entries/export", { depotId, from, to });
    downloadBlob(blob, `heures_${from}_${to}.csv`);
  });

  const totals = useMemo(() => {
    const m = new Map<string, { name: string; real: number; paid: number; offset: number; days: number }>();
    for (const e of data ?? []) {
      const t = m.get(e.userId) ?? { name: e.userName, real: 0, paid: 0, offset: e.currentOffset, days: 0 };
      t.real += e.real ?? 0;
      t.paid += e.paid ?? 0;
      t.days += 1;
      m.set(e.userId, t);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Heures"
        description="Pointages des chauffeurs, arrondis selon les réglages du dépôt"
        actions={
          can("time.export") && (
            <Button variant="outline" onClick={() => exportCsv.mutate(undefined)} disabled={!valid || exportCsv.isPending}>
              {exportCsv.isPending ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
              Exporter CSV
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="from">Du</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">Au</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        {!valid && <p className="pb-2 text-sm text-destructive">La période est invalide.</p>}
      </div>

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <EmptyState icon={<ClockIcon />} title="Aucun pointage sur la période" />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chauffeur</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Réel</TableHead>
                  <TableHead>Arrondi</TableHead>
                  <TableHead className="text-right">Pause</TableHead>
                  <TableHead className="text-right">Durée réelle</TableHead>
                  <TableHead className="text-right">Durée payée</TableHead>
                  <TableHead className="text-right">Écart cumulé</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.userName}</TableCell>
                    <TableCell className="tabular-nums">{formatDayShort(e.date)}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatTime(e.startAt)} – {e.endAt ? formatTime(e.endAt) : <Badge variant="secondary">en cours</Badge>}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatTime(e.roundedStart)} – {formatTime(e.roundedEnd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.breakMinutes} min</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMinutes(e.real)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMinutes(e.paid)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", (e.offsetAfter ?? 0) > 0 ? "text-emerald-700" : (e.offsetAfter ?? 0) < 0 ? "text-red-600" : "")}>
                      {formatOffset(e.offsetAfter)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {e.correctedBy && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline">corrigé</Badge>
                            </TooltipTrigger>
                            <TooltipContent>{e.note ?? "Correction manuelle"}</TooltipContent>
                          </Tooltip>
                        )}
                        {can("time.manage", e.depotId) && (
                          <Button size="icon-xs" variant="ghost" aria-label="Corriger" onClick={() => setEditing(e)}>
                            <PencilIcon />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                {totals.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Total sur {t.days} jour{t.days > 1 ? "s" : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMinutes(t.real)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatMinutes(t.paid)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">compteur : {formatOffset(t.offset)}</TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </TableFooter>
            </Table>
          </div>
        </>
      )}
      {editing && <CorrectDialog entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CorrectDialog({ entry, onClose }: { entry: TimeEntry; onClose: () => void }) {
  const correct = useCorrectTimeEntry();
  const [startAt, setStartAt] = useState(toParisLocalInput(entry.startAt));
  const [endAt, setEndAt] = useState(toParisLocalInput(entry.endAt));
  const [roundedStart, setRoundedStart] = useState(toParisLocalInput(entry.roundedStart));
  const [roundedEnd, setRoundedEnd] = useState(toParisLocalInput(entry.roundedEnd));
  const [breakMinutes, setBreakMinutes] = useState(String(entry.breakMinutes));
  const [note, setNote] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            correct.mutate(
              {
                id: entry.id,
                startAt: fromParisLocalInput(startAt) ?? undefined,
                endAt: fromParisLocalInput(endAt),
                roundedStart: fromParisLocalInput(roundedStart) ?? undefined,
                roundedEnd: fromParisLocalInput(roundedEnd),
                breakMinutes: Number(breakMinutes) || 0,
                note: note.trim(),
              },
              { onSuccess: onClose },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Corriger le pointage</DialogTitle>
            <DialogDescription>
              {entry.userName} · {formatDayShort(entry.date)}. Heures de Paris. Votre code PIN sera demandé.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="c-start">Début réel</Label>
              <Input id="c-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-end">Fin réelle</Label>
              <Input id="c-end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-rstart">Début arrondi</Label>
              <Input id="c-rstart" type="datetime-local" value={roundedStart} onChange={(e) => setRoundedStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-rend">Fin arrondie</Label>
              <Input id="c-rend" type="datetime-local" value={roundedEnd} onChange={(e) => setRoundedEnd(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-break">Pause (minutes)</Label>
              <Input id="c-break" type="number" min={0} value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-note">Motif de la correction (obligatoire)</Label>
            <Textarea id="c-note" value={note} onChange={(e) => setNote(e.target.value)} required maxLength={500} placeholder="Oubli de pointage, badge…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!note.trim() || !startAt || correct.isPending}>
              {correct.isPending && <Loader2Icon className="animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
