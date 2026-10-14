import { useState } from "react";
import { Loader2Icon, LockOpenIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { PERMISSIONS, ALL_PERMISSIONS, type Permission } from "@me/shared";
import { useAuth } from "@/lib/auth";
import { useOverrides, useRoles, useSaveOverrides, useSaveUser, useUsers, type UserInput } from "@/queries/admin";
import { useDebounced } from "@/hooks/use-debounced";
import { formatDateTime } from "@/lib/format";
import type { Depot, PermissionOverride, Role, User } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ToneBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GLOBAL = "__global__";

function depotLabel(depots: Depot[], id: string | null) {
  if (id === null) return "Tous les dépôts";
  return depots.find((d) => d.id === id)?.code ?? "Autre dépôt";
}

export function UsersPage() {
  const { depotId, depots, can, me } = useAuth();
  const [search, setSearch] = useState("");
  const [allDepots, setAllDepots] = useState(false);
  const q = useDebounced(search.trim(), 300);
  const { data, isLoading } = useUsers({ depotId: allDepots ? undefined : depotId, search: q || undefined });
  const save = useSaveUser();
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const canManage = can("users.manage");
  const isGlobal = !!me?.permissions["*"]?.length;

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Utilisateurs"
        description="Équipe du panel et chauffeurs, avec leurs rôles par dépôt"
        actions={
          canManage && (
            <Button onClick={() => setEditing("new")}>
              <PlusIcon /> Nouvel utilisateur
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nom, email, identifiant…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        {(isGlobal || depots.length > 1) && (
          <div className="flex items-center gap-2">
            <Switch id="all-depots" checked={allDepots} onCheckedChange={setAllDepots} />
            <Label htmlFor="all-depots">Tous les dépôts</Label>
          </div>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <EmptyState icon={<UsersIcon />} title="Aucun utilisateur" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Identifiant</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôles</TableHead>
                <TableHead>Dernière connexion</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((u) => (
                <TableRow key={u.id} className={u.isActive ? "" : "opacity-60"}>
                  <TableCell>
                    <div className="font-medium">
                      {u.firstName} {u.lastName}
                    </div>
                    <div className="flex gap-1">
                      {u.locked && <ToneBadge tone="red">Bloqué</ToneBadge>}
                      {u.totpEnabled && <ToneBadge tone="green">2FA</ToneBadge>}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{u.login ?? "—"}</TableCell>
                  <TableCell className="text-sm">{u.email ?? "—"}</TableCell>
                  <TableCell className="max-w-80">
                    <div className="flex flex-wrap gap-1">
                      {u.assignments.map((a) => (
                        <Badge key={a.id} variant="secondary">
                          {a.roleName} · {depotLabel(depots, a.depotId)}
                        </Badge>
                      ))}
                      {!u.assignments.length && <span className="text-xs text-muted-foreground">Aucun rôle</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Jamais"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={u.isActive}
                      disabled={!canManage || u.id === me?.user.id}
                      onCheckedChange={(isActive) => save.mutate({ id: u.id, isActive })}
                      aria-label="Actif"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canManage && u.locked && (
                        <Button size="xs" variant="outline" onClick={() => save.mutate({ id: u.id, unlock: true })}>
                          <LockOpenIcon /> Débloquer
                        </Button>
                      )}
                      {(canManage || can("roles.manage")) && (
                        <Button size="icon-xs" variant="ghost" aria-label="Modifier" onClick={() => setEditing(u)}>
                          <PencilIcon />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && <UserDialog user={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------- Création / édition ----------

interface AssignmentRow {
  key: number;
  roleId: string;
  depotId: string; // GLOBAL pour « Tous les dépôts »
}

function UserDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { depots, depotId, me, can } = useAuth();
  const roles = useRoles();
  const save = useSaveUser();
  const canManage = can("users.manage");
  const canGlobal = !!me?.permissions["*"]?.includes("users.manage");

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [login, setLogin] = useState(user?.login ?? "");
  const [password, setPassword] = useState("");
  const [driverPin, setDriverPin] = useState("");
  const [panelPin, setPanelPin] = useState("");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [rows, setRows] = useState<AssignmentRow[]>(() =>
    (user?.assignments ?? []).map((a, i) => ({ key: i, roleId: a.roleId, depotId: a.depotId ?? GLOBAL })),
  );
  const [nextKey, setNextKey] = useState(1000);

  const pinOk = (p: string) => !p || /^\d{4,6}$/.test(p);
  const rowsOk = rows.every((r) => r.roleId);
  const valid = firstName.trim() && lastName.trim() && (!password || password.length >= 10) && pinOk(driverPin) && pinOk(panelPin) && rowsOk;

  const submit = () => {
    const assignments = rows.map((r) => ({ roleId: r.roleId, depotId: r.depotId === GLOBAL ? null : r.depotId }));
    const unique = assignments.filter((a, i) => assignments.findIndex((b) => b.roleId === a.roleId && b.depotId === a.depotId) === i);
    const body: Partial<UserInput> & { id?: string } = {
      id: user?.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      login: login.trim() || null,
      assignments: unique,
      isActive,
    };
    if (password) body.password = password;
    if (driverPin) body.driverPin = driverPin;
    if (panelPin) body.panelPin = panelPin;
    save.mutate(body, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{user ? `${user.firstName} ${user.lastName}` : "Nouvel utilisateur"}</DialogTitle>
          <DialogDescription>Votre code PIN sera demandé pour enregistrer.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="identity">
          <TabsList>
            <TabsTrigger value="identity">Identité</TabsTrigger>
            <TabsTrigger value="access">Accès et rôles</TabsTrigger>
            {user && can("roles.manage") && <TabsTrigger value="overrides">Exceptions</TabsTrigger>}
          </TabsList>

          <form
            id="user-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) submit();
            }}
          >
            <TabsContent value="identity" className="grid gap-3 pt-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="u-first">Prénom</Label>
                <Input id="u-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} required disabled={!canManage} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="u-last">Nom</Label>
                <Input id="u-last" value={lastName} onChange={(e) => setLastName(e.target.value)} required disabled={!canManage} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="u-email">Email (connexion au panel)</Label>
                <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canManage} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="u-phone">Téléphone</Label>
                <Input id="u-phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canManage} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="u-login">Identifiant chauffeur</Label>
                <Input id="u-login" value={login} onChange={(e) => setLogin(e.target.value.toUpperCase())} placeholder="CH04" maxLength={20} disabled={!canManage} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch id="u-active" checked={isActive} onCheckedChange={setIsActive} disabled={!canManage || user?.id === me?.user.id} />
                <Label htmlFor="u-active">Compte actif</Label>
              </div>
            </TabsContent>

            <TabsContent value="access" className="grid gap-4 pt-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="u-pass">{user?.hasPassword ? "Nouveau mot de passe" : "Mot de passe"}</Label>
                  <Input id="u-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="10 caractères min." disabled={!canManage} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="u-dpin">{user?.hasDriverPin ? "Nouveau PIN chauffeur" : "PIN chauffeur"}</Label>
                  <Input id="u-dpin" inputMode="numeric" value={driverPin} onChange={(e) => setDriverPin(e.target.value.replace(/\D/g, ""))} maxLength={6} placeholder="4 à 6 chiffres" disabled={!canManage} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="u-ppin">PIN panel</Label>
                  <Input id="u-ppin" inputMode="numeric" value={panelPin} onChange={(e) => setPanelPin(e.target.value.replace(/\D/g, ""))} maxLength={6} placeholder="4 à 6 chiffres" disabled={!canManage} />
                </div>
              </div>
              {password && password.length < 10 && <p className="text-xs text-destructive">Le mot de passe doit faire au moins 10 caractères.</p>}
              {user && <p className="text-xs text-muted-foreground">Laisser vide pour ne pas changer. Un nouveau PIN chauffeur devra être changé à la première connexion.</p>}

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Rôles par dépôt</Label>
                  {canManage && (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        setRows([...rows, { key: nextKey, roleId: "", depotId: depotId ?? GLOBAL }]);
                        setNextKey(nextKey + 1);
                      }}
                    >
                      <PlusIcon /> Ajouter une affectation
                    </Button>
                  )}
                </div>
                {!rows.length && <p className="text-sm text-muted-foreground">Aucun rôle : l'utilisateur n'aura accès à rien.</p>}
                {rows.map((r) => (
                  <div key={r.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Select value={r.roleId || undefined} onValueChange={(v) => setRows(rows.map((x) => (x.key === r.key ? { ...x, roleId: v } : x)))} disabled={!canManage}>
                      <SelectTrigger className="w-full" aria-label="Rôle">
                        <SelectValue placeholder="Rôle…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(roles.data ?? []).map((role: Role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={r.depotId} onValueChange={(v) => setRows(rows.map((x) => (x.key === r.key ? { ...x, depotId: v } : x)))} disabled={!canManage}>
                      <SelectTrigger className="w-full" aria-label="Dépôt">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={GLOBAL} disabled={!canGlobal}>
                          Tous les dépôts
                        </SelectItem>
                        {depots.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                        {r.depotId !== GLOBAL && !depots.some((d) => d.id === r.depotId) && <SelectItem value={r.depotId}>Autre dépôt</SelectItem>}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="icon" variant="ghost" aria-label="Retirer" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} disabled={!canManage}>
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>
          </form>

          {user && can("roles.manage") && (
            <TabsContent value="overrides" className="pt-3">
              <OverridesEditor userId={user.id} />
            </TabsContent>
          )}
        </Tabs>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
          {canManage && (
            <Button type="submit" form="user-form" disabled={!valid || save.isPending}>
              {save.isPending && <Loader2Icon className="animate-spin" />}
              {user ? "Enregistrer" : "Créer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Exceptions de permissions ----------

interface OverrideRow extends Omit<PermissionOverride, "depotId"> {
  key: number;
  depotId: string;
}

function OverridesEditor({ userId }: { userId: string }) {
  const { depots, depotId } = useAuth();
  const { data, isLoading } = useOverrides(userId);
  const saveOverrides = useSaveOverrides();
  const [rows, setRows] = useState<OverrideRow[] | null>(null);
  const current: OverrideRow[] = rows ?? (data ?? []).map((o, i) => ({ ...o, key: i, depotId: o.depotId ?? GLOBAL }));
  const set = (next: OverrideRow[]) => setRows(next);

  if (isLoading) return <Skeleton className="h-24" />;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Ajoute ou retire une permission précise à cet utilisateur, en plus de ses rôles.</p>
      {!current.length && <p className="text-sm">Aucune exception.</p>}
      {current.map((r) => (
        <div key={r.key} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
          <Select value={r.permission} onValueChange={(v) => set(current.map((x) => (x.key === r.key ? { ...x, permission: v as Permission } : x)))}>
            <SelectTrigger className="w-full" aria-label="Permission">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_PERMISSIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {PERMISSIONS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={r.depotId} onValueChange={(v) => set(current.map((x) => (x.key === r.key ? { ...x, depotId: v } : x)))}>
            <SelectTrigger className="w-full" aria-label="Dépôt">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GLOBAL}>Tous les dépôts</SelectItem>
              {depots.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={r.effect} onValueChange={(v) => set(current.map((x) => (x.key === r.key ? { ...x, effect: v as "grant" | "deny" } : x)))}>
            <SelectTrigger className="w-full" aria-label="Effet">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grant">Accorder</SelectItem>
              <SelectItem value="deny">Retirer</SelectItem>
            </SelectContent>
          </Select>
          <Button size="icon" variant="ghost" aria-label="Retirer" onClick={() => set(current.filter((x) => x.key !== r.key))}>
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <div className="flex justify-between gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => set([...current, { key: Date.now(), permission: "dashboard.view", depotId: depotId ?? GLOBAL, effect: "grant" }])}
        >
          <PlusIcon /> Ajouter une exception
        </Button>
        <Button
          size="sm"
          disabled={!rows || saveOverrides.isPending}
          onClick={() =>
            saveOverrides.mutate(
              { userId, overrides: current.map((r) => ({ permission: r.permission, depotId: r.depotId === GLOBAL ? null : r.depotId, effect: r.effect })) },
              { onSuccess: () => setRows(null) },
            )
          }
        >
          {saveOverrides.isPending && <Loader2Icon className="animate-spin" />}
          Enregistrer les exceptions
        </Button>
      </div>
    </div>
  );
}
