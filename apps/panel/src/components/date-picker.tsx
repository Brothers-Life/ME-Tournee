import { useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, formatDay, todayParis } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Sélecteur de jour (yyyy-mm-dd) avec flèches précédent / suivant. */
export function DayPicker({ value, onChange, className, compact }: { value: string; onChange: (d: string) => void; className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const isToday = value === todayParis();
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button variant="ghost" size="icon-sm" aria-label="Jour précédent" onClick={() => onChange(addDays(value, -1))}>
        <ChevronLeftIcon />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="min-w-0 flex-1 justify-start font-normal" data-testid="day-picker">
            <CalendarIcon />
            <span className="truncate first-letter:uppercase">{formatDay(value, compact ? "EEE d MMM" : "EEE d MMM yyyy")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={fr}
            selected={parseISO(value)}
            defaultMonth={parseISO(value)}
            onSelect={(d) => {
              if (d) onChange(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }}
          />
          {!isToday && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  onChange(todayParis());
                  setOpen(false);
                }}
              >
                Aujourd'hui
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon-sm" aria-label="Jour suivant" onClick={() => onChange(addDays(value, 1))}>
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
