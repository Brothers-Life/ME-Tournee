import { useState } from "react";
import { CopyIcon, KeyRoundIcon, Loader2Icon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { setToken } from "@/lib/api";
import { useChangePassword, useSetPanelPin, useTotpDisable, useTotpEnable, useTotpSetup } from "@/queries/admin";
import { PageHeader, InfoRow } from "@/components/page-header";
import { ToneBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success("Copié"),
    () => toast.error("Copie impossible"),
  );
}

export function AccountPage() {
  const { me, depots } = useAuth();
  if (!me) return null;
  const u = me.user;
  return (
    <div className="grid max-w-3xl gap-4">
      <PageHeader title="Mon compte" description={`${u.firstName} ${u.lastName}`} />
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          <InfoRow label="Email">{u.email ?? "—"}</InfoRow>
          {u.login && <InfoRow label="Identifiant chauffeur">{u.login}</InfoRow>}
          <InfoRow label="Dépôts accessibles">
            <span className="flex flex-wrap justify-end gap-1">
              {me.permissions["*"]?.length ? <Badge variant="secondary">Tous les dépôts</Badge> : depots.map((d) => <Badge key={d.id} variant="secondary">{d.code}</Badge>)}
            </span>
          </InfoRow>
          <InfoRow label="Code PIN panel">{u.hasPanelPin ? <ToneBadge tone="green">Défini</ToneBadge> : <ToneBadge tone="amber">À créer</ToneBadge>}</InfoRow>
          <InfoRow label="Double authentification">{u.totpEnabled ? <ToneBadge tone="green">Activée</ToneBadge> : <ToneBadge tone="gray">Désactivée</ToneBadge>}</InfoRow>
        </CardContent>
      </Card>
      <PanelPinCard hasPin={u.hasPanelPin} />
      <PasswordCard />
      <TotpCard enabled={u.totpEnabled} />
    </div>
  );
}

function PanelPinCard({ hasPin }: { hasPin: boolean }) {
  const setPin = useSetPanelPin();
  const [password, setPassword] = useState("");
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const valid = /^\d{4,6}$/.test(pin) && pin === confirm && password;
  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPin.mutate(
            { password, newPin: pin },
            {
              onSuccess: () => {
                setPassword("");
                setPinValue("");
                setConfirm("");
              },
            },
          );
        }}
        className="grid gap-4"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4" /> {hasPin ? "Changer mon code PIN" : "Créer mon code PIN"}
          </CardTitle>
          <CardDescription>4 à 6 chiffres. Il déverrouille le panel après inactivité et confirme les actions sensibles.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pin-pass">Mot de passe actuel</Label>
            <Input id="pin-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pin-new">Nouveau PIN</Label>
            <Input id="pin-new" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pin-confirm">Confirmer le PIN</Label>
            <Input id="pin-confirm" type="password" inputMode="numeric" maxLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} />
          </div>
          {confirm && pin !== confirm && <p className="text-xs text-destructive sm:col-span-3">Les deux PIN ne correspondent pas.</p>}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!valid || setPin.isPending}>
            {setPin.isPending && <Loader2Icon className="animate-spin" />}
            Enregistrer le PIN
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const valid = current && next.length >= 10 && next === confirm;
  return (
    <Card>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate(
            { current, next },
            {
              onSuccess: () => {
                toast.success("Mot de passe changé : reconnectez-vous avec le nouveau mot de passe");
                setToken(null);
              },
            },
          );
        }}
      >
        <CardHeader>
          <CardTitle>Mot de passe</CardTitle>
          <CardDescription>10 caractères minimum. Toutes vos sessions seront fermées.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pw-current">Mot de passe actuel</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pw-new">Nouveau mot de passe</Label>
            <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pw-confirm">Confirmer</Label>
            <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {next && next.length < 10 && <p className="text-xs text-destructive sm:col-span-3">10 caractères minimum.</p>}
          {confirm && next !== confirm && <p className="text-xs text-destructive sm:col-span-3">Les deux mots de passe ne correspondent pas.</p>}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!valid || change.isPending}>
            {change.isPending && <Loader2Icon className="animate-spin" />}
            Changer le mot de passe
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function TotpCard({ enabled }: { enabled: boolean }) {
  const setup = useTotpSetup();
  const enable = useTotpEnable();
  const disable = useTotpDisable();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {enabled ? <ShieldCheckIcon className="size-4 text-emerald-600" /> : <ShieldOffIcon className="size-4" />}
          Double authentification
        </CardTitle>
        <CardDescription>Un code à 6 chiffres d'une application d'authentification (Google Authenticator, Microsoft Authenticator…) sera demandé à chaque connexion.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {enabled ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              disable.mutate(password, { onSuccess: () => setPassword("") });
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="totp-off-pass">Mot de passe</Label>
              <Input id="totp-off-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-64" />
            </div>
            <Button type="submit" variant="destructive" disabled={!password || disable.isPending}>
              {disable.isPending && <Loader2Icon className="animate-spin" />}
              Désactiver
            </Button>
          </form>
        ) : !setup.data ? (
          <Button className="w-fit" onClick={() => setup.mutate(undefined)} disabled={setup.isPending}>
            {setup.isPending && <Loader2Icon className="animate-spin" />}
            Activer la double authentification
          </Button>
        ) : (
          <div className="grid gap-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Dans votre application, ajoutez un compte avec la clé ci-dessous (ou collez le lien otpauth).</li>
              <li>Saisissez le code à 6 chiffres affiché pour confirmer. La configuration expire dans 10 minutes.</li>
            </ol>
            <div className="grid gap-1.5">
              <Label>Clé secrète</Label>
              <div className="flex gap-2">
                <Input readOnly value={setup.data.secret} className="font-mono" onFocus={(e) => e.target.select()} />
                <Button type="button" variant="outline" size="icon" aria-label="Copier la clé" onClick={() => copy(setup.data!.secret)}>
                  <CopyIcon />
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Lien otpauth</Label>
              <div className="flex gap-2">
                <Input readOnly value={setup.data.uri} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button type="button" variant="outline" size="icon" aria-label="Copier le lien" onClick={() => copy(setup.data!.uri)}>
                  <CopyIcon />
                </Button>
              </div>
            </div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                enable.mutate(code, {
                  onSuccess: () => {
                    setCode("");
                    setup.reset();
                  },
                });
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="totp-code">Code de vérification</Label>
                <Input id="totp-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="w-40 font-mono tracking-widest" />
              </div>
              <Button type="submit" disabled={code.length !== 6 || enable.isPending}>
                {enable.isPending && <Loader2Icon className="animate-spin" />}
                Confirmer
              </Button>
              <Button type="button" variant="ghost" onClick={() => setup.reset()}>
                Annuler
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
