// Images servies par GET /files/:id (Bearer requis) : chargées via fetch puis exposées en blob URL.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileIcon, ImageOffIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function useFileBlob(id: string | null | undefined) {
  return useQuery({
    queryKey: ["file", id],
    queryFn: () => api.blob(`/files/${id}`),
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    meta: { silent: true },
  });
}

export function useFileUrl(id: string | null | undefined) {
  const { data, isLoading, isError } = useFileBlob(id);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const u = URL.createObjectURL(data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data]);
  return { url, isLoading, isError, mime: data?.type };
}

export function AuthImage({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const { url, isLoading, isError, mime } = useFileUrl(id);
  const [broken, setBroken] = useState(false);
  if (isLoading) return <Skeleton className={cn("aspect-square", className)} />;
  if (isError || !url)
    return (
      <div className={cn("flex aspect-square items-center justify-center rounded-md bg-muted text-muted-foreground", className)}>
        <ImageOffIcon className="size-5" />
      </div>
    );
  // Fichier non affichable comme image (PDF, format inconnu) : simple vignette.
  if (broken || (mime && !mime.startsWith("image/")))
    return (
      <div className={cn("flex aspect-square flex-col items-center justify-center gap-1 rounded-md bg-muted text-xs text-muted-foreground", className)}>
        <FileIcon className="size-5" />
        Fichier
      </div>
    );
  return <img src={url} alt={alt} onError={() => setBroken(true)} className={cn("rounded-md object-cover", className)} />;
}

/** Vignettes cliquables, agrandies dans une boîte de dialogue. */
export function PhotoGrid({ ids, label = "Photo", size = "size-20" }: { ids: (string | null | undefined)[]; label?: string; size?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const list = ids.filter((x): x is string => !!x);
  if (!list.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {list.map((id, i) => (
          <button key={id + i} type="button" onClick={() => setOpen(id)} className="overflow-hidden rounded-md border hover:opacity-90">
            <AuthImage id={id} alt={`${label} ${i + 1}`} className={size} />
          </button>
        ))}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>{label}</DialogTitle>
          {open && <FullImage id={open} alt={label} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FullImage({ id, alt }: { id: string; alt: string }) {
  const { url } = useFileUrl(id);
  const [broken, setBroken] = useState(false);
  if (!url) return <Skeleton className="h-96 w-full" />;
  if (broken)
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-sm underline">
        Ouvrir le fichier dans un nouvel onglet
      </a>
    );
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={alt} onError={() => setBroken(true)} className="max-h-[75vh] w-full rounded-md object-contain" />
    </a>
  );
}
