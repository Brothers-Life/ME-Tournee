import { useState } from "react";
import { Loader2Icon, LockIcon } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinInput } from "@/components/pin-input";

/** Écran plein affiché après 15 min d'inactivité. */
export function LockScreen() {
  const { me, unlock, logout, login } = useAuth();
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasPin = me?.user.hasPanelPin ?? true;

  const submitPin = async (value: string) => {
    if (value.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/unlock", { pin: value }, { skipPinPrompt: true });
      unlock();
    } catch (e) {
      setError(errorMessage(e));
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  // Sans PIN : on se ré-authentifie avec le mot de passe.
  const submitPassword = async () => {
    if (!me?.user.email) return;
    setBusy(true);
    setError(null);
    try {
      const res = await login(me.user.email, password, needTotp ? totp : undefined);
      if ("needTotp" in res) setNeedTotp(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
          <LockIcon className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Panel verrouillé</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          {me ? `${me.user.firstName} ${me.user.lastName} — ` : ""}
          {hasPin ? "saisissez votre code PIN pour reprendre." : "saisissez votre mot de passe pour reprendre."}
        </p>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (hasPin) void submitPin(pin);
            else void submitPassword();
          }}
        >
          {hasPin ? (
            <div className="flex justify-center">
              <PinInput value={pin} onChange={setPin} onComplete={(v) => void submitPin(v)} autoFocus />
            </div>
          ) : (
            <>
              <div className="grid gap-1.5 text-left">
                <Label htmlFor="lock-password">Mot de passe</Label>
                <Input id="lock-password" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {needTotp && (
                <div className="grid gap-1.5 text-left">
                  <Label htmlFor="lock-totp">Code de double authentification</Label>
                  <Input id="lock-totp" inputMode="numeric" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value)} />
                </div>
              )}
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || (hasPin ? pin.length < 4 : !password)}>
            {busy && <Loader2Icon className="animate-spin" />}
            Déverrouiller
          </Button>
          <Button type="button" variant="ghost" onClick={() => void logout()}>
            Se déconnecter
          </Button>
        </form>
      </div>
    </div>
  );
}
