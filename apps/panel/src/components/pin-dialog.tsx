// Boîte de dialogue PIN branchée sur l'intercepteur du client API.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LockKeyholeIcon } from "lucide-react";
import { registerPinRequester } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PinInput } from "@/components/pin-input";

interface Pending {
  message: string;
  invalid: boolean;
  resolve: (pin: string | null) => void;
}

export function PinDialogProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Pending | null>(null);
  const queue = useRef<Pending[]>([]);
  const [pin, setPin] = useState("");

  const next = useCallback(() => {
    setPin("");
    setCurrent(queue.current.shift() ?? null);
  }, []);

  useEffect(() => {
    registerPinRequester(
      (message, invalid) =>
        new Promise<string | null>((resolve) => {
          const item = { message, invalid, resolve };
          setCurrent((cur) => {
            if (cur) {
              queue.current.push(item);
              return cur;
            }
            setPin("");
            return item;
          });
        }),
    );
    return () => registerPinRequester(null);
  }, []);

  const finish = (value: string | null) => {
    current?.resolve(value);
    next();
  };

  return (
    <>
      {children}
      <Dialog open={!!current} onOpenChange={(o) => !o && finish(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pin.length >= 4) finish(pin);
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LockKeyholeIcon className="size-4" /> Code PIN requis
              </DialogTitle>
              <DialogDescription className={current?.invalid ? "text-destructive" : undefined}>{current?.message}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center">
              <PinInput value={pin} onChange={setPin} autoFocus onComplete={(v) => finish(v)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => finish(null)}>
                Annuler
              </Button>
              <Button type="submit" disabled={pin.length < 4}>
                Confirmer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
