// Rôles : matrice permissions × rôles, modifications groupées puis enregistrées (PIN demandé).
import { Fragment, useMemo, useState } from "react";
import { Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, SaveIcon, Trash2Icon, UndoIcon } from "lucide-react";
import { PERMISSIONS, PERMISSION_GROUPS, PIN_PROTECTED_ACTIONS, type Permission } from "@me/shared";
import { useDeleteRole, useRoles, useSaveRole } from "@/queries/admin";
import type { Role } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const PIN_SET = new Set<Permission>(PIN_PROTECTED_ACTIONS);

export function RolesPage() {
  const { data: roles, isLoading } = useRoles();
  const save = useSaveRole();
  const del = useDeleteRole();
  const [draft, setDraft] = useState<Record<string, Set<Permission>>>({});
  const [dialog, setDialog] = useState<Role | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);

  const permsOf = (r: Role) => draft[r.id] ?? new Set(r.permissions);
  const changed = useMemo(
    () =>
      (roles ?? []).filter((r) => {
        const d = draft[r.id];
        if (!d) return false;
        return d.size !== r.permissions.length || r.permissions.some((p) => !d.has(p));
      }),
    [roles, draft],
  );

  const toggle = (r: Role, p: Permission, on: boolean) => {
    const next = new Set(permsOf(r));
    if (on) next.add(p);
    else next.delete(p);
    setDraft({ ...draft, [r.id]: next });
  };
  const toggleGroup = (r: Role, perms: Permission[], on: boolean) => {
    const next = new Set(permsOf(r));
    for (const p of perms) {
      if (on) next.add(p);
      else next.delete(p);
    }
    setDraft({ ...draft, [r.id]: next });
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const r of changed) await save.mutateAsync({ id: r.id, permissions: [...permsOf(r)] });
      setDraft({});
    } catch {
      /* erreur affichée par le toast global */
    } finally {
      setSaving(false);
    }
  };

  const locked = (r: Role) => r.key === "super_admin";

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Rôles et permissions"
        description="Cochez les permissions de chaque rôle. Le dépôt est choisi lors de l'affectation d'un rôle à un utilisateur."
        actions={
          <>
            {changed.length > 0 && (
              <Button variant="ghost" onClick={() => setDraft({})} disabled={saving}>
                <UndoIcon /> Annuler
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialog("new")}>
              <PlusIcon /> Nouveau rôle
            </Button>
            <Button onClick={() => void saveAll()} disabled={!changed.length || saving}>
              {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              Enregistrer{changed.length ? ` (${changed.length})` : ""}
            </Button>
          </>
        }
      />

      {isLoading || !roles ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b">
                <th className="sticky left-0 z-10 min-w-64 bg-background p-2 text-left font-medium">Permission</th>
                {roles.map((r) => (
                  <th key={r.id} className={cn("min-w-28 border-l p-2 text-center align-bottom font-medium", draft[r.id] && changed.includes(r) && "bg-amber-50 dark:bg-amber-950")}>
                    <div className="flex items-start justify-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="line-clamp-2 cursor-default">{r.name}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{r.description ?? r.name}</TooltipContent>
                      </Tooltip>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-xs" variant="ghost" aria-label={`Actions ${r.name}`}>
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setDialog(r)}>
                            <PencilIcon /> Renommer
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" disabled={r.isSystem} onSelect={() => setToDelete(r)}>
                            <Trash2Icon /> Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {r.isSystem && (
                      <Badge variant="outline" className="mt-1 font-normal">
                        système
                      </Badge>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((g) => (
                <Fragment key={g.label}>
                  <tr className="border-b bg-muted/50">
                    <td className="sticky left-0 bg-muted p-2 text-xs font-semibold tracking-wide uppercase">{g.label}</td>
                    {roles.map((r) => {
                      const perms = permsOf(r);
                      const all = g.permissions.every((p) => perms.has(p));
                      const some = g.permissions.some((p) => perms.has(p));
                      return (
                        <td key={r.id} className="border-l p-2 text-center">
                          <Checkbox
                            checked={all ? true : some ? "indeterminate" : false}
                            disabled={locked(r)}
                            onCheckedChange={(v) => toggleGroup(r, g.permissions, v === true)}
                            aria-label={`${g.label} — ${r.name}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {g.permissions.map((p) => (
                    <tr key={p} className="border-b hover:bg-muted/30">
                      <td className="sticky left-0 bg-background p-2">
                        {PERMISSIONS[p]}
                        {PIN_SET.has(p) && (
                          <Badge variant="outline" className="ml-2 font-normal">
                            PIN
                          </Badge>
                        )}
                        <div className="text-xs text-muted-foreground">{p}</div>
                      </td>
                      {roles.map((r) => (
                        <td key={r.id} className="border-l p-2 text-center">
                          <Checkbox
                            checked={permsOf(r).has(p)}
                            disabled={locked(r)}
                            onCheckedChange={(v) => toggle(r, p, v === true)}
                            aria-label={`${PERMISSIONS[p]} — ${r.name}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog && <RoleDialog role={dialog === "new" ? null : dialog} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer le rôle « ${toDelete?.name ?? ""} » ?`}
        description="Les utilisateurs qui l'ont le perdront. Votre code PIN sera demandé."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
      />
    </div>
  );
}

function RoleDialog({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const save = useSaveRole();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              role
                ? { id: role.id, name: name.trim(), description: description.trim() || null }
                : { name: name.trim(), description: description.trim() || null, permissions: [] },
              { onSuccess: onClose },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{role ? "Renommer le rôle" : "Nouveau rôle"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="r-name">Nom</Label>
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-desc">Description</Label>
            <Textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {!role && <p className="text-sm text-muted-foreground">Le rôle est créé sans permission : cochez-les ensuite dans la matrice.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={name.trim().length < 2 || save.isPending}>
              {save.isPending && <Loader2Icon className="animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
