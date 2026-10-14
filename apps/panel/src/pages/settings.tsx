import { useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, Loader2Icon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { DEFAULT_DEPOT_SETTINGS, VEHICLE_TYPES, type DepotSettings, type VehicleType } from "@me/shared";
import { useAuth } from "@/lib/auth";
import { useIncidentTypes, useSaveIncidentTypes, useSaveSmsTemplates, useSmsTemplates, useUpdateDepot } from "@/queries/admin";
import type { Depot } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SettingsPage() {
  const { depot, can, me } = useAuth();
  const canDepot = can("depots.manage");
  const canSettings = can("settings.manage");
  const isGlobalSettings = !!me?.permissions["*"]?.includes("settings.manage");
  const first = canDepot ? "depot" : "sms";

  if (!depot) return null;
  return (
    <div className="grid gap-4">
      <PageHeader title="Réglages" description={depot.name} />
      <Tabs defaultValue={first} key={depot.id}>
        <TabsList>
          {canDepot && <TabsTrigger value="depot">Dépôt</TabsTrigger>}
          {canSettings && <TabsTrigger value="sms">SMS prédéfinis</TabsTrigger>}
          {canSettings && <TabsTrigger value="incidents">Types d'incident</TabsTrigger>}
        </TabsList>
        {canDepot && (
          <TabsContent value="depot" className="pt-2">
            <DepotSettingsForm depot={depot} />
          </TabsContent>
        )}
        {canSettings && (
          <TabsContent value="sms" className="grid gap-4 pt-2">
            <SmsTemplates depotId={depot.id} global={false} title={`SMS du dépôt ${depot.code}`} description="Proposés aux chauffeurs de ce dépôt, en plus des SMS communs." />
            <SmsTemplates depotId={depot.id} global title="SMS communs à tous les dépôts" description="Modifiables uniquement par un administrateur global." readOnly={!isGlobalSettings} />
          </TabsContent>
        )}
        {canSettings && (
          <TabsContent value="incidents" className="pt-2">
            <IncidentTypesEditor readOnly={!canSettings} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ---------- Réglages du dépôt ----------

function SettingRow({ id, label, description, children }: { id?: string; label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function DepotSettingsForm({ depot }: { depot: Depot }) {
  const update = useUpdateDepot();
  const [s, setS] = useState<DepotSettings>({ ...DEFAULT_DEPOT_SETTINGS, ...depot.settings });
  useEffect(() => setS({ ...DEFAULT_DEPOT_SETTINGS, ...depot.settings }), [depot]);
  const set = <K extends keyof DepotSettings>(k: K, v: DepotSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify({ ...DEFAULT_DEPOT_SETTINGS, ...depot.settings });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fonctionnement du dépôt</CardTitle>
        <CardDescription>Ces réglages s'appliquent à l'app chauffeur et au calcul des heures.</CardDescription>
      </CardHeader>
      <CardContent>
        <SettingRow id="pal" label="Comptage des palettes" description="Demandé aux contrôles départ et retour.">
          <Switch id="pal" checked={s.palettesEnabled} onCheckedChange={(v) => set("palettesEnabled", v)} />
        </SettingRow>
        {s.palettesEnabled && (
          <SettingRow label="Véhicules concernés par les palettes">
            <div className="flex gap-4">
              {VEHICLE_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={s.palettesVehicleTypes.includes(t)}
                    onCheckedChange={(v) =>
                      set("palettesVehicleTypes", v ? [...new Set([...s.palettesVehicleTypes, t])] : s.palettesVehicleTypes.filter((x: VehicleType) => x !== t))
                    }
                  />
                  {t}
                </label>
              ))}
            </div>
          </SettingRow>
        )}
        <SettingRow id="temp" label="Relevé de température" description="Saisie de la température du camion et à la livraison.">
          <Switch id="temp" checked={s.temperatureEnabled} onCheckedChange={(v) => set("temperatureEnabled", v)} />
        </SettingRow>
        {s.temperatureEnabled && (
          <SettingRow id="temp-req" label="Température obligatoire">
            <Switch id="temp-req" checked={s.temperatureRequired} onCheckedChange={(v) => set("temperatureRequired", v)} />
          </SettingRow>
        )}
        <SettingRow id="photo" label="Photo du BL signé obligatoire" description="Le chauffeur ne peut pas terminer une livraison sans la photo.">
          <Switch id="photo" checked={s.requireSignedBlPhoto} onCheckedChange={(v) => set("requireSignedBlPhoto", v)} />
        </SettingRow>
        <SettingRow label="Arrondi des heures" description="Avec compensation : l'écart cumulé est rattrapé pour rester juste sur la durée.">
          <div className="flex items-center gap-2">
            <Select value={s.timeRounding} onValueChange={(v) => set("timeRounding", v as DepotSettings["timeRounding"])}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun arrondi</SelectItem>
                <SelectItem value="nearest">Au plus proche</SelectItem>
                <SelectItem value="compensated">Avec compensation</SelectItem>
              </SelectContent>
            </Select>
            {s.timeRounding !== "none" && (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={s.roundingStepMinutes}
                  onChange={(e) => set("roundingStepMinutes", Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                  className="w-20"
                  aria-label="Pas d'arrondi en minutes"
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            )}
          </div>
        </SettingRow>
        <SettingRow id="gps" label="Conservation de l'historique GPS" description="Les positions plus anciennes sont supprimées automatiquement.">
          <div className="flex items-center gap-1">
            <Input
              id="gps"
              type="number"
              min={1}
              max={365}
              value={s.gpsRetentionDays}
              onChange={(e) => set("gpsRetentionDays", Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">jours</span>
          </div>
        </SettingRow>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={() => update.mutate({ id: depot.id, settings: s })} disabled={!dirty || update.isPending}>
          {update.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          Enregistrer
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------- SMS prédéfinis ----------

function SmsTemplates({ depotId, global, title, description, readOnly }: { depotId: string; global: boolean; title: string; description: string; readOnly?: boolean }) {
  const { data, isLoading } = useSmsTemplates(depotId);
  const save = useSaveSmsTemplates();
  const [rows, setRows] = useState<{ label: string; body: string }[] | null>(null);
  const server = (data ?? []).filter((t) => (global ? t.depotId === null : t.depotId === depotId)).map((t) => ({ label: t.label, body: t.body }));
  const current = rows ?? server;
  const valid = current.every((r) => r.label.trim() && r.body.trim() && r.body.length <= 480);
  const edit = (i: number, patch: Partial<{ label: string; body: string }>) => setRows(current.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : !current.length ? (
          <p className="text-sm text-muted-foreground">Aucun SMS.</p>
        ) : (
          current.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[12rem_1fr_auto]">
              <Input value={r.label} onChange={(e) => edit(i, { label: e.target.value })} placeholder="Libellé" disabled={readOnly} aria-label="Libellé" />
              <div>
                <Textarea value={r.body} onChange={(e) => edit(i, { body: e.target.value })} rows={2} disabled={readOnly} aria-label="Message" />
                <p className={r.body.length > 480 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{r.body.length} / 480</p>
              </div>
              {!readOnly && (
                <Button size="icon" variant="ghost" aria-label="Supprimer" onClick={() => setRows(current.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
      {!readOnly && (
        <CardFooter className="justify-between">
          <Button variant="outline" size="sm" onClick={() => setRows([...current, { label: "", body: "" }])}>
            <PlusIcon /> Ajouter un SMS
          </Button>
          <Button
            size="sm"
            disabled={!rows || !valid || save.isPending}
            onClick={() => save.mutate({ depotId: global ? null : depotId, templates: current.map((r) => ({ label: r.label.trim(), body: r.body.trim() })) }, { onSuccess: () => setRows(null) })}
          >
            {save.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            Enregistrer
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// ---------- Types d'incident ----------

interface TypeRow {
  key: string;
  label: string;
  actions: string;
  isActive: boolean;
  isNew?: boolean;
}

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

function IncidentTypesEditor({ readOnly }: { readOnly: boolean }) {
  const { data, isLoading } = useIncidentTypes();
  const save = useSaveIncidentTypes();
  const [rows, setRows] = useState<TypeRow[] | null>(null);
  const current: TypeRow[] = rows ?? (data ?? []).map((t) => ({ key: t.key, label: t.label, actions: t.actions.join(", "), isActive: t.isActive }));
  const edit = (i: number, patch: Partial<TypeRow>) =>
    setRows(current.map((r, j) => (j === i ? { ...r, ...patch, ...(r.isNew && patch.label !== undefined ? { key: slugify(patch.label) } : {}) } : r)));
  const moveRow = (i: number, d: -1 | 1) => {
    const next = [...current];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    setRows(next);
  };
  const keys = current.map((r) => r.key);
  const valid = current.every((r) => r.label.trim() && /^[a-z0-9_]+$/.test(r.key)) && new Set(keys).size === keys.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Types d'incident</CardTitle>
        <CardDescription>
          Communs à tous les dépôts. Les actions proposées au chauffeur sont séparées par des virgules. Un type ne peut pas être supprimé : désactivez-le.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          current.map((r, i) => (
            <div key={r.key + i} className="grid items-center gap-2 rounded-md border p-2 sm:grid-cols-[auto_14rem_1fr_auto_auto]">
              <div className="flex">
                <Button size="icon-xs" variant="ghost" disabled={readOnly || i === 0} onClick={() => moveRow(i, -1)} aria-label="Monter">
                  <ArrowUpIcon />
                </Button>
                <Button size="icon-xs" variant="ghost" disabled={readOnly || i === current.length - 1} onClick={() => moveRow(i, 1)} aria-label="Descendre">
                  <ArrowDownIcon />
                </Button>
              </div>
              <div>
                <Input value={r.label} onChange={(e) => edit(i, { label: e.target.value })} disabled={readOnly} aria-label="Libellé" />
                <div className="mt-0.5 text-xs text-muted-foreground">{r.key || "clé"}</div>
              </div>
              <Input value={r.actions} onChange={(e) => edit(i, { actions: e.target.value })} disabled={readOnly} placeholder="Repris, Laissé au client" aria-label="Actions" />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={r.isActive} onCheckedChange={(v) => edit(i, { isActive: v })} disabled={readOnly} />
                Actif
              </label>
              {r.isNew && !readOnly ? (
                <Button size="icon-xs" variant="ghost" aria-label="Retirer" onClick={() => setRows(current.filter((_, j) => j !== i))}>
                  <Trash2Icon />
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))
        )}
        {!valid && <p className="text-sm text-destructive">Chaque type doit avoir un libellé et une clé unique.</p>}
      </CardContent>
      {!readOnly && (
        <CardFooter className="justify-between">
          <Button variant="outline" size="sm" onClick={() => setRows([...current, { key: "", label: "", actions: "", isActive: true, isNew: true }])}>
            <PlusIcon /> Ajouter un type
          </Button>
          <Button
            size="sm"
            disabled={!rows || !valid || save.isPending}
            onClick={() =>
              save.mutate(
                current.map((r) => ({
                  key: r.key,
                  label: r.label.trim(),
                  actions: r.actions.split(",").map((a) => a.trim()).filter(Boolean),
                  isActive: r.isActive,
                })),
                { onSuccess: () => setRows(null) },
              )
            }
          >
            {save.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            Enregistrer
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
