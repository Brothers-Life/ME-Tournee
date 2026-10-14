import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Loader2Icon } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [step, setStep] = useState<"password" | "totp">("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (token) return <Navigate to={from} replace />;

  const submit = async (code?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await login(email.trim(), password, step === "totp" ? (code ?? totp) : undefined);
      if ("needTotp" in res) {
        setStep("totp");
        setTotp("");
      } else navigate(from, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      if (step === "totp") setTotp("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">ME</div>
          <div className="leading-tight">
            <div className="font-semibold">ME Tournée</div>
            <div className="text-xs text-muted-foreground">Maison Esclaire</div>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{step === "password" ? "Connexion au panel" : "Double authentification"}</CardTitle>
            <CardDescription>
              {step === "password" ? "Identifiez-vous avec votre email professionnel." : "Saisissez le code à 6 chiffres de votre application d'authentification."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {step === "password" ? (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="password">Mot de passe</Label>
                    <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                </>
              ) : (
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    pattern={REGEXP_ONLY_DIGITS}
                    value={totp}
                    onChange={setTotp}
                    onComplete={(v) => void submit(v)}
                    autoFocus
                    aria-label="Code de double authentification"
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }, (_, i) => (
                        <InputOTPSlot key={i} index={i} className="size-10 text-base" />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              )}
              <Button type="submit" disabled={busy || (step === "totp" && totp.length < 6)}>
                {busy && <Loader2Icon className="animate-spin" />}
                {step === "password" ? "Se connecter" : "Valider le code"}
              </Button>
              {step === "totp" && (
                <Button type="button" variant="ghost" onClick={() => setStep("password")}>
                  Retour
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
