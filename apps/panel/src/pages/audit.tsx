import { Fragment, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, HistoryIcon } from "lucide-react";
import { useAudit } from "@/queries/admin";
import { formatDateTime } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Connexion au panel",
  "auth.driver_login": "Connexion chauffeur",
  "user.create": "Création d'utilisateur",
  "user.update": "Modification d'utilisateur",
  "user.overrides": "Exceptions de permissions",
  "user.password_changed": "Mot de passe changé",
  "user.panel_pin_changed": "PIN panel changé",
  "user.driver_pin_changed": "PIN chauffeur changé",
  "user.totp_enabled": "Double authentification activée",
  "user.totp_disabled": "Double authentification désactivée",
  "role.create": "Création de rôle",
  "role.update": "Modification de rôle",
  "role.delete": "Suppression de rôle",
  "depot.create": "Création de dépôt",
  "depot.update": "Réglages du dépôt",
  "vehicle.create": "Ajout de véhicule",
  "vehicle.update": "Modification de véhicule",
  "sector.create": "Création de secteur",
  "sector.update": "Modification de secteur",
  "sector.delete": "Suppression de secteur",
  "client.update": "Modification de client",
  "settings.sms_templates": "SMS prédéfinis",
  "settings.incident_types": "Types d'incident",
  "import.create": "Import de BL",
  "planning.auto": "Répartition automatique",
  "planning.move": "Déplacement de BL",
  "tour.create": "Création de tournée",
  "tour.update": "Modification de tournée",
  "tour.validate": "Validation de tournée",
  "tour.unvalidate": "Tournée repassée en brouillon",
  "tour.close": "Clôture de tournée",
  "tour.delete": "Suppression de tournée",
  "tour.reorder": "Réordonnancement de tournée",
  "incident.update": "Traitement d'incident",
  "time.correct": "Correction d'heures",
  "time.export": "Export des heures",
  "gps.history_view": "Consultation de l'historique GPS",
};

const ENTITIES: Record<string, string> = {
  user: "Utilisateurs",
  role: "Rôles",
  depot: "Dépôts",
  vehicle: "Véhicules",
  sector: "Secteurs",
  client: "Clients",
  import: "Imports",
  tour: "Tournées",
  delivery_note: "BL",
  incident: "Incidents",
  time_entry: "Heures",
  sms_templates: "SMS",
  incident_types: "Types d'incident",
};

const ALL = "__all__";

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <pre className="max-h-80 overflow-auto rounded-md bg-muted p-2 text-xs leading-relaxed">{value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export function AuditPage() {
  const [entity, setEntity] = useState(ALL);
  const [limit, setLimit] = useState(100);
  const { data, isLoading, isFetching } = useAudit({ entity: entity === ALL ? undefined : entity, limit });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  return (
    <div className="grid gap-4">
      <PageHeader title="Journal d'audit" description="Toutes les actions sensibles, avec l'état avant / après" />
      <Select
        value={entity}
        onValueChange={(v) => {
          setEntity(v);
          setLimit(100);
        }}
      >
        <SelectTrigger className="w-56" aria-label="Entité">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Toutes les entités</SelectItem>
          {Object.entries(ENTITIES).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !data?.length ? (
        <EmptyState icon={<HistoryIcon />} title="Aucune entrée" />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Date</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entité</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((e) => {
                  const expandable = e.before !== null || e.after !== null;
                  const isOpen = open.has(e.id);
                  return (
                    <Fragment key={e.id}>
                      <TableRow className={expandable ? "cursor-pointer" : ""} onClick={() => expandable && toggle(e.id)}>
                        <TableCell>{expandable && (isOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />)}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(e.createdAt)}</TableCell>
                        <TableCell>{e.userName ?? <span className="text-muted-foreground">Système</span>}</TableCell>
                        <TableCell>
                          <div>{ACTION_LABELS[e.action] ?? e.action}</div>
                          <div className="text-xs text-muted-foreground">{e.action}</div>
                        </TableCell>
                        <TableCell>
                          <div>{ENTITIES[e.entity] ?? e.entity}</div>
                          {e.entityId && <div className="max-w-40 truncate text-xs text-muted-foreground">{e.entityId}</div>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{e.ip ?? "—"}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell />
                          <TableCell colSpan={5} className="whitespace-normal">
                            <div className="grid gap-3 py-2 lg:grid-cols-2">
                              <Json label="Avant" value={e.before} />
                              <Json label="Après" value={e.after} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {data.length >= limit && limit < 500 && (
            <Button variant="outline" className="justify-self-center" onClick={() => setLimit(Math.min(500, limit + 100))} disabled={isFetching}>
              Afficher plus
            </Button>
          )}
        </>
      )}
    </div>
  );
}
