import {
  DELIVERY_STATUS_LABELS, INCIDENT_STATUS_LABELS, TOUR_STATUS_LABELS,
  type DeliveryStatus, type IncidentStatus, type TourStatus,
} from "@me/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ImportStatus } from "@/lib/types";

// Palette commune : gris = en attente, bleu = prêt, ambre = en cours, vert = terminé, rouge = problème.
export const TONES = {
  gray: "bg-muted text-muted-foreground border-border",
  blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  amber: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  violet: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  orange: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900",
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
} as const;
export type Tone = keyof typeof TONES;
/** Pastille pleine de la même teinte (légendes). */
export const TONE_DOTS: Record<Tone, string> = {
  gray: "bg-zinc-400", blue: "bg-blue-500", amber: "bg-amber-500", violet: "bg-violet-500", green: "bg-emerald-500", orange: "bg-orange-500", red: "bg-red-500",
};

export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn(TONES[tone], className)}>
      {children}
    </Badge>
  );
}

export const TOUR_TONES: Record<TourStatus, Tone> = { draft: "gray", validated: "blue", in_progress: "amber", returned: "violet", closed: "green" };
export const DELIVERY_TONES: Record<DeliveryStatus, Tone> = { pending: "gray", arrived: "blue", delivered: "green", partial: "orange", failed: "red" };
export const INCIDENT_TONES: Record<IncidentStatus, Tone> = { new: "red", in_progress: "amber", closed: "green" };
export const IMPORT_TONES: Record<ImportStatus, Tone> = { queued: "gray", processing: "blue", done: "green", failed: "red" };
export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = { queued: "En file", processing: "En cours", done: "Terminé", failed: "Échec" };

export function TourStatusBadge({ status, className }: { status: TourStatus; className?: string }) {
  return <ToneBadge tone={TOUR_TONES[status]} className={className}>{TOUR_STATUS_LABELS[status]}</ToneBadge>;
}

export function DeliveryStatusBadge({ status, className }: { status: DeliveryStatus; className?: string }) {
  return <ToneBadge tone={DELIVERY_TONES[status]} className={className}>{DELIVERY_STATUS_LABELS[status]}</ToneBadge>;
}

export function IncidentStatusBadge({ status, className }: { status: IncidentStatus; className?: string }) {
  return <ToneBadge tone={INCIDENT_TONES[status]} className={className}>{INCIDENT_STATUS_LABELS[status]}</ToneBadge>;
}

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  return <ToneBadge tone={IMPORT_TONES[status]}>{IMPORT_STATUS_LABELS[status]}</ToneBadge>;
}
