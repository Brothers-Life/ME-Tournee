import { useState } from "react";
import { Loader2Icon, MailIcon, PencilIcon, SearchIcon, StoreIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useClients, useSectors, useUpdateClient } from "@/queries/admin";
import { useDebounced } from "@/hooks/use-debounced";
import { formatPhones } from "@/lib/format";
import type { Client, Sector } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ALL = "__all__";
const NONE = "__none__";

function SectorDot({ sector }: { sector?: Sector }) {
  if (!sector) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: sector.color }} />
      {sector.name}
    </span>
  );
}

export function ClientsPage() {
  const { depotId, can } = useAuth();
  const [search, setSearch] = useState("");
  const [sectorId, setSectorId] = useState(ALL);
  const q = useDebounced(search.trim(), 300);
  const { data, isLoading } = useClients({ search: q || undefined, sectorId: sectorId === ALL ? undefined : sectorId });
  const sectors = useSectors(depotId);
  const update = useUpdateClient();
  const [editing, setEditing] = useState<Client | null>(null);
  const canManage = can("clients.manage");
  const sectorById = new Map((sectors.data ?? []).map((s) => [s.id, s]));

  return (
    <div className="grid gap-4">
      <PageHeader title="Clients" description="Créés automatiquement à l'import des BL" />
      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nom, code ou ville…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={sectorId} onValueChange={setSectorId}>
          <SelectTrigger className="w-56" aria-label="Secteur">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les secteurs</SelectItem>
            {(sectors.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <EmptyState icon={<StoreIcon />} title="Aucun client trouvé" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Adresse</TableHead>
                <TableHead>Téléphones</TableHead>
                <TableHead>Secteur</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>BL signé par mail</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.code}</div>
                    {c.notes && <div className="max-w-56 truncate text-xs text-amber-700">{c.notes}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="max-w-56 truncate">{c.addressLines.join(", ")}</div>
                    <div className="text-muted-foreground">
                      {c.postalCode} {c.city}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{formatPhones(c.phones)}</TableCell>
                  <TableCell>
                    <SectorDot sector={c.sectorId ? sectorById.get(c.sectorId) : undefined} />
                  </TableCell>
                  <TableCell className="text-sm">{c.email ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Switch
                      checked={c.emailSignedBl}
                      disabled={!canManage || (!c.email && !c.emailSignedBl)}
                      onCheckedChange={(v) => update.mutate({ id: c.id, emailSignedBl: v })}
                      aria-label="Envoyer le BL signé par mail"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <Button size="icon-xs" variant="ghost" aria-label="Modifier" onClick={() => setEditing(c)}>
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
      {editing && <ClientDialog client={editing} sectors={sectors.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ClientDialog({ client, sectors, onClose }: { client: Client; sectors: Sector[]; onClose: () => void }) {
  const update = useUpdateClient();
  const [sectorId, setSectorId] = useState(client.sectorId ?? NONE);
  const [email, setEmail] = useState(client.email ?? "");
  const [emailSignedBl, setEmailSignedBl] = useState(client.emailSignedBl);
  const [notes, setNotes] = useState(client.notes ?? "");
  const known = sectorId === NONE || sectors.some((s) => s.id === sectorId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate(
              { id: client.id, sectorId: sectorId === NONE ? null : sectorId, email: email.trim() || null, emailSignedBl: emailSignedBl && !!email.trim(), notes: notes.trim() || null },
              { onSuccess: onClose },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{client.name}</DialogTitle>
            <DialogDescription>
              {client.code} · {client.postalCode} {client.city}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>Secteur</Label>
            <Select value={sectorId} onValueChange={setSectorId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucun (selon le code postal)</SelectItem>
                {!known && <SelectItem value={sectorId}>Secteur d'un autre dépôt</SelectItem>}
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="client-email">Email</Label>
            <Input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@client.fr" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label htmlFor="client-signed" className="flex items-center gap-1.5">
                <MailIcon className="size-4" /> Envoyer le BL signé par mail
              </Label>
              <p className="text-xs text-muted-foreground">Envoyé automatiquement après la livraison.</p>
            </div>
            <Switch id="client-signed" checked={emailSignedBl} onCheckedChange={setEmailSignedBl} disabled={!email.trim()} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="client-notes">Notes</Label>
            <Textarea id="client-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Accès, code portail, consignes…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Loader2Icon className="animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
