import { useRef, useState } from "react";
import { FileUpIcon, Loader2Icon, UploadCloudIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useCreateImport, useImports } from "@/queries/ops";
import { formatDateTime } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ImportStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ImportsPage() {
  const { depotId, depot, can } = useAuth();
  const { data, isLoading } = useImports(depotId);
  const create = useCreateImport();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canCreate = can("imports.create");

  const send = (files: FileList | File[] | null) => {
    if (!files || !depotId) return;
    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error(`« ${file.name} » n'est pas un PDF`);
        continue;
      }
      create.mutate({ depotId, file });
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader title="Imports de BL" description={`PDF des bons de livraison du jour · ${depot?.name ?? ""}`} />

      {canCreate && (
        <Card
          className={cn("border-2 border-dashed py-0 transition-colors", dragging && "border-primary bg-muted/50")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            send(e.dataTransfer.files);
          }}
        >
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            {create.isPending ? <Loader2Icon className="size-8 animate-spin text-muted-foreground" /> : <UploadCloudIcon className="size-8 text-muted-foreground" />}
            <div>
              <p className="font-medium">Glissez le PDF des BL ici</p>
              <p className="text-sm text-muted-foreground">Les BL sont extraits automatiquement, les doublons sont ignorés.</p>
            </div>
            <Button onClick={() => inputRef.current?.click()} disabled={create.isPending}>
              <FileUpIcon /> Choisir un fichier
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              data-testid="import-input"
              onChange={(e) => {
                send(e.target.files);
                e.target.value = "";
              }}
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data?.length ? (
        <EmptyState icon={<FileUpIcon />} title="Aucun import pour ce dépôt" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fichier</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">BL</TableHead>
                <TableHead className="text-right">Nouveaux clients</TableHead>
                <TableHead className="text-right">Doublons ignorés</TableHead>
                <TableHead>Importé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell>
                    <div className="font-medium">{imp.fileName}</div>
                    {imp.source === "email" && <div className="text-xs text-muted-foreground">Reçu par email</div>}
                    {imp.error && <div className="max-w-md text-xs whitespace-normal text-destructive">{imp.error}</div>}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {imp.status === "processing" && <Loader2Icon className="size-3 animate-spin text-blue-600" />}
                      <ImportStatusBadge status={imp.status} />
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{imp.blCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{imp.newClients}</TableCell>
                  <TableCell className="text-right tabular-nums">{imp.skipped}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(imp.createdAt)}
                    {imp.createdByName && <div className="text-xs">par {imp.createdByName}</div>}
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
