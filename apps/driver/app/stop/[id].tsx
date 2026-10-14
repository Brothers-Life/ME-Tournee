// Chez le client : contact, arrivée, contrôle de la marchandise, problèmes, reprise, signature.
import { BigButton, NumberInput, PhotoField, Screen, Section, StatusPill, toNumber, YesNo, type PhotoRef } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { call, currentPosition, openMaps, sms } from '@/lib/device';
import { act, patchLocal, uid, useStore } from '@/lib/store';
import type { Line, Note, Today } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatPhone } from '@me/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CheckIcon, MapPinIcon, MessageSquareIcon, PhoneIcon, TriangleAlertIcon, XIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

const DONE = ['delivered', 'partial', 'failed'];

function findNote(t: Today | null, id: string) {
  for (const tour of t?.tours ?? []) {
    const n = tour.notes.find((x) => x.id === id);
    if (n) return { tour, note: n };
  }
  return null;
}

export default function Stop() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useStore((s) => s.today);
  const found = findNote(today, id);
  const [incidentFor, setIncidentFor] = React.useState<Line | null | undefined>(undefined);

  if (!found || !today) return <Screen><Text>Livraison introuvable.</Text></Screen>;
  const { note, tour } = found;
  const done = DONE.includes(note.status);
  const editable = tour.status === 'in_progress' && !done;
  const c = note.clientSnapshot;
  const address = [...c.addressLines, `${c.postalCode ?? ''} ${c.city ?? ''}`.trim()].join(', ');
  const phones = note.client.phones.length ? note.client.phones : c.phones;

  const arrive = async () => {
    const pos = await currentPosition();
    const at = new Date().toISOString();
    act('Arrivée chez le client', 'POST', `/driver/notes/${note.id}/arrive`, { lat: pos?.lat ?? null, lng: pos?.lng ?? null, at }, (t) => {
      const n = findNote(t, note.id)?.note;
      if (n) {
        n.arrivedAt = at;
        if (n.status === 'pending') n.status = 'arrived';
      }
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: c.name }} />
      <Screen>
        <Section>
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-xl font-bold">{c.name}</Text>
            <StatusPill status={note.status} />
          </View>
          <Pressable onPress={() => openMaps(address)} className="flex-row items-center gap-2">
            <MapPinIcon size={16} />
            <Text className="flex-1 text-primary underline">{address}</Text>
          </Pressable>
          <Text>
            BL {note.number}
            {note.windowStart ? ` · livraison ${note.windowStart}–${note.windowEnd}` : ''} · {note.packageCount ?? '?'} colis
            {note.netWeightKg ? ` · ${Number(note.netWeightKg).toLocaleString('fr-FR')} kg` : ''}
          </Text>
          {note.comment ? (
            <View className="rounded-lg border border-amber-400 bg-amber-50 p-3 dark:bg-amber-950">
              <Text className="text-xs font-semibold uppercase text-amber-700">Consigne du BL</Text>
              <Text className="text-base font-semibold text-amber-900 dark:text-amber-100">{note.comment}</Text>
            </View>
          ) : null}
          {note.client.notes ? <Text className="text-muted-foreground">Note client : {note.client.notes}</Text> : null}
        </Section>

        <Contact note={note} phones={phones} templates={today.smsTemplates} enabled={tour.status === 'in_progress'} />

        {editable && !note.arrivedAt ? <BigButton label="Je suis arrivé" icon={MapPinIcon} onPress={arrive} /> : null}

        <Goods note={note} editable={editable} onProblem={(l) => setIncidentFor(l)} />

        <Incidents note={note} today={today} editable={editable} openFor={incidentFor} setOpenFor={setIncidentFor} />

        {note.pickupRequested ? <Pickup note={note} editable={editable} /> : null}

        {editable ? <Finish note={note} today={today} /> : null}
        {done ? <Text className="text-center text-muted-foreground">Livraison enregistrée.</Text> : null}
      </Screen>
    </>
  );
}

function Contact({ note, phones, templates, enabled }: { note: Note; phones: string[]; templates: Today['smsTemplates']; enabled: boolean }) {
  const [smsTo, setSmsTo] = React.useState<string | null>(null);
  const [custom, setCustom] = React.useState('');
  const log = (kind: 'call' | 'sms', to: string, body?: string) =>
    enabled && act(kind === 'call' ? 'Appel' : 'SMS', 'POST', `/driver/notes/${note.id}/communications`, { kind, to, body: body ?? null });

  const sendSms = (to: string, body: string) => {
    log('sms', to, body);
    void sms(to, body);
    setSmsTo(null);
    setCustom('');
  };

  if (!phones.length) return null;
  return (
    <Section title="Contacter le client">
      {phones.map((p) => (
        <View key={p} className="gap-2">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-lg font-medium">{formatPhone(p)}</Text>
            <Button variant="outline" onPress={() => { log('call', p); void call(p); }}>
              <PhoneIcon size={16} />
              <Text>Appeler</Text>
            </Button>
            <Button variant="outline" onPress={() => setSmsTo(smsTo === p ? null : p)}>
              <MessageSquareIcon size={16} />
              <Text>SMS</Text>
            </Button>
          </View>
          {smsTo === p ? (
            <View className="gap-2 rounded-lg bg-secondary p-3">
              {templates.map((t) => (
                <Pressable key={t.id} onPress={() => sendSms(p, t.body)} className="rounded-md border border-border bg-background p-3 active:bg-accent">
                  <Text className="font-medium">{t.label}</Text>
                  <Text className="text-sm text-muted-foreground">{t.body}</Text>
                </Pressable>
              ))}
              <Textarea value={custom} onChangeText={setCustom} placeholder="Message personnalisé" />
              <Button disabled={!custom.trim()} onPress={() => sendSms(p, custom.trim())}>
                <Text>Envoyer ce message</Text>
              </Button>
            </View>
          ) : null}
        </View>
      ))}
    </Section>
  );
}

function Goods({ note, editable, onProblem }: { note: Note; editable: boolean; onProblem: (l: Line) => void }) {
  const lines = [...note.lines].sort((a, b) => a.position - b.position);
  const categories = [...new Set(lines.map((l) => l.category))];
  const setStatus = (lineId: string, status: Line['checkStatus']) =>
    patchLocal((t) => {
      const l = findNote(t, note.id)?.note.lines.find((x) => x.id === lineId);
      if (l) l.checkStatus = status;
    });
  const allOk = () =>
    patchLocal((t) => {
      findNote(t, note.id)?.note.lines.forEach((l) => {
        if (l.checkStatus === 'unchecked') l.checkStatus = 'ok';
      });
    });
  const checked = lines.filter((l) => l.checkStatus !== 'unchecked').length;

  return (
    <Section
      title={`Marchandise (${checked}/${lines.length} pointées)`}
      right={editable ? (
        <Button size="sm" variant="outline" onPress={allOk}>
          <Text>Tout est OK</Text>
        </Button>
      ) : undefined}>
      {categories.map((cat) => (
        <View key={cat} className="gap-2">
          <Text className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{cat}</Text>
          {lines.filter((l) => l.category === cat).map((l) => (
            <View key={l.id} className={cn('flex-row items-center gap-2 rounded-lg border p-2', l.checkStatus === 'ok' ? 'border-emerald-500' : l.checkStatus === 'issue' ? 'border-red-500' : 'border-border')}>
              <Pressable disabled={!editable} onPress={() => setStatus(l.id, l.checkStatus === 'ok' ? 'unchecked' : 'ok')} className="flex-1">
                <Text className="font-medium">{l.designation}</Text>
                <Text className="text-sm text-muted-foreground">
                  {Number(l.quantity).toLocaleString('fr-FR')} {l.unit}
                  {l.lotNumber ? ` · lot ${l.lotNumber}` : ''}
                  {l.dlc ? ` · DLC ${l.dlc.split('-').reverse().join('/')}` : ''}
                </Text>
              </Pressable>
              {editable ? (
                <>
                  <Pressable onPress={() => setStatus(l.id, 'ok')} className={cn('h-11 w-11 items-center justify-center rounded-lg', l.checkStatus === 'ok' ? 'bg-emerald-600' : 'bg-secondary')}>
                    <CheckIcon size={20} color={l.checkStatus === 'ok' ? 'white' : undefined} />
                  </Pressable>
                  <Pressable onPress={() => onProblem(l)} className={cn('h-11 w-11 items-center justify-center rounded-lg', l.checkStatus === 'issue' ? 'bg-red-600' : 'bg-secondary')}>
                    <TriangleAlertIcon size={20} color={l.checkStatus === 'issue' ? 'white' : undefined} />
                  </Pressable>
                </>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </Section>
  );
}

function Incidents({ note, today, editable, openFor, setOpenFor }: { note: Note; today: Today; editable: boolean; openFor: Line | null | undefined; setOpenFor: (l: Line | null | undefined) => void }) {
  const [type, setType] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<string | null>(null);
  const [qty, setQty] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [photos, setPhotos] = React.useState<PhotoRef[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const open = openFor !== undefined;
  const types = today.incidentTypes;
  const actions = types.find((t) => t.key === type)?.actions ?? [];

  const reset = () => {
    setType(null);
    setAction(null);
    setQty('');
    setComment('');
    setPhotos([]);
    setError(null);
    setOpenFor(undefined);
  };

  const save = () => {
    if (!type) return setError('Choisissez le type de problème');
    if (photos.length === 0) return setError('Une photo est obligatoire');
    const incident = { id: uid(), lineId: openFor?.id ?? null, type, quantity: toNumber(qty), action, comment: comment.trim() || null, photoIds: photos.map((p) => p.id) };
    act('Signalement de problème', 'POST', `/driver/notes/${note.id}/incidents`, incident, (t) => {
      const n = findNote(t, note.id)?.note;
      if (!n) return;
      n.incidents.push({ ...incident, quantity: incident.quantity?.toString() ?? null, status: 'new' });
      const l = n.lines.find((x) => x.id === incident.lineId);
      if (l) l.checkStatus = 'issue';
    });
    reset();
  };

  const remove = (incId: string) =>
    act('Suppression de problème', 'DELETE', `/driver/incidents/${incId}`, undefined, (t) => {
      const n = findNote(t, note.id)?.note;
      if (n) n.incidents = n.incidents.filter((i) => i.id !== incId);
    });

  const label = (key: string) => types.find((t) => t.key === key)?.label ?? key;

  return (
    <Section title="Problèmes">
      {note.incidents.map((i) => {
        const line = note.lines.find((l) => l.id === i.lineId);
        return (
          <View key={i.id} className="flex-row items-start gap-2 rounded-lg bg-red-50 p-3 dark:bg-red-950">
            <View className="flex-1">
              <Text className="font-semibold">{label(i.type)}</Text>
              {line ? <Text className="text-sm">{line.designation}</Text> : null}
              <Text className="text-sm text-muted-foreground">
                {[i.quantity ? `Qté ${i.quantity}` : null, i.action, i.comment].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {editable ? (
              <Pressable onPress={() => remove(i.id)} className="p-1">
                <XIcon size={18} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {note.incidents.length === 0 && !open ? <Text className="text-muted-foreground">Aucun problème signalé.</Text> : null}

      {editable && !open ? (
        <Button variant="outline" onPress={() => setOpenFor(null)}>
          <TriangleAlertIcon size={16} />
          <Text>Signaler un problème</Text>
        </Button>
      ) : null}

      {open ? (
        <View className="gap-3 rounded-lg border border-red-300 p-3">
          <Text className="font-semibold">{openFor ? `Problème sur : ${openFor.designation}` : 'Problème sur la livraison'}</Text>
          <View className="flex-row flex-wrap gap-2">
            {types.map((t) => (
              <Pressable key={t.key} onPress={() => { setType(t.key); setAction(null); }} className={cn('rounded-full border px-3 py-2', type === t.key ? 'border-red-600 bg-red-600' : 'border-border')}>
                <Text className={cn('text-sm', type === t.key && 'text-white')}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          {actions.length ? (
            <>
              <Text className="text-sm">Qu'est-ce que vous faites ?</Text>
              <View className="flex-row flex-wrap gap-2">
                {actions.map((a) => (
                  <Pressable key={a} onPress={() => setAction(a)} className={cn('rounded-full border px-3 py-2', action === a ? 'border-primary bg-primary' : 'border-border')}>
                    <Text className={cn('text-sm', action === a && 'text-primary-foreground')}>{a}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <Text className="text-sm">Quantité concernée</Text>
          <NumberInput value={qty} onChange={setQty} placeholder={openFor ? `sur ${Number(openFor.quantity)} ${openFor.unit}` : 'ex. 1'} />
          <Textarea value={comment} onChangeText={setComment} placeholder="Commentaire (facultatif)" />
          <PhotoField label="Photo (obligatoire)" photos={photos} onChange={setPhotos} />
          {error ? <Text className="text-destructive">{error}</Text> : null}
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={reset}>
              <Text>Annuler</Text>
            </Button>
            <Button className="flex-1" onPress={save}>
              <Text>Enregistrer</Text>
            </Button>
          </View>
        </View>
      ) : null}
    </Section>
  );
}

function Pickup({ note, editable }: { note: Note; editable: boolean }) {
  const [done, setDone] = React.useState<boolean | null>(note.pickup?.done ?? null);
  const [qty, setQty] = React.useState(note.pickup?.quantity ?? '');
  const [comment, setComment] = React.useState(note.pickup?.comment ?? '');
  const [photos, setPhotos] = React.useState<PhotoRef[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const saved = !!note.pickup;

  const save = () => {
    if (done === null) return setError('Indiquez si la reprise est faite');
    if (done && photos.length === 0) return setError('Prenez en photo ce que vous reprenez');
    const body = { done, quantity: toNumber(qty), comment: comment.trim() || null, photoIds: photos.map((p) => p.id) };
    act('Reprise', 'PUT', `/driver/notes/${note.id}/pickup`, body, (t) => {
      const n = findNote(t, note.id)?.note;
      if (n) n.pickup = { done, quantity: body.quantity?.toString() ?? null, comment: body.comment };
    });
    setError(null);
  };

  return (
    <Section title="Reprise demandée">
      <Text className="text-violet-700 dark:text-violet-300">{note.comment}</Text>
      {editable ? (
        <>
          <YesNo label="Reprise faite ?" value={done} onChange={setDone} />
          {done ? (
            <>
              <Text className="text-sm">Nombre de colis repris</Text>
              <NumberInput value={qty} onChange={setQty} placeholder="ex. 1" />
              <PhotoField label="Photo de la reprise" photos={photos} onChange={setPhotos} />
            </>
          ) : null}
          <Textarea value={comment} onChangeText={setComment} placeholder={done === false ? 'Pourquoi ? (ex. client absent)' : 'Commentaire (facultatif)'} />
          {error ? <Text className="text-destructive">{error}</Text> : null}
          <Button variant={saved ? 'outline' : 'default'} onPress={save}>
            <Text>{saved ? 'Mettre à jour la reprise' : 'Enregistrer la reprise'}</Text>
          </Button>
        </>
      ) : (
        <Text>{note.pickup ? (note.pickup.done ? `Faite (${note.pickup.quantity ?? '?'} colis)` : 'Non faite') : 'Non renseignée'}</Text>
      )}
    </Section>
  );
}

function Finish({ note, today }: { note: Note; today: Today }) {
  const settings = today.depot?.settings;
  const [photo, setPhoto] = React.useState<PhotoRef[]>([]);
  const [signer, setSigner] = React.useState('');
  const [temp, setTemp] = React.useState('');
  const [failReason, setFailReason] = React.useState('');
  const [failing, setFailing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const complete = async (status: 'delivered' | 'failed') => {
    setError(null);
    const temperature = toNumber(temp);
    if (status === 'delivered') {
      if (settings?.requireSignedBlPhoto && photo.length === 0) return setError('Prenez en photo le BL signé');
      if (settings?.temperatureEnabled && settings.temperatureRequired && temperature === null) return setError('Relevé de température obligatoire');
      if (note.lines.some((l) => l.checkStatus === 'unchecked')) return setError('Pointez toutes les lignes (ou « Tout est OK »)');
    } else if (!failReason.trim()) return setError('Indiquez pourquoi la livraison n\'a pas pu se faire');
    if (note.pickupRequested && !note.pickup) return setError('Indiquez si la reprise demandée a été faite');

    const pos = await currentPosition();
    act('Pointage des lignes', 'PUT', `/driver/notes/${note.id}/lines`, { lines: note.lines.map((l) => ({ id: l.id, checkStatus: l.checkStatus })) });
    act(
      status === 'delivered' ? 'Fin de livraison' : 'Livraison impossible',
      'POST',
      `/driver/notes/${note.id}/complete`,
      {
        status, signerName: signer.trim() || null, signedBlPhotoId: photo[0]?.id ?? null,
        temperature: settings?.temperatureEnabled ? temperature : null, lat: pos?.lat ?? null, lng: pos?.lng ?? null,
        comment: status === 'failed' ? failReason.trim() : null,
      },
      (t) => {
        const n = findNote(t, note.id)?.note;
        if (!n) return;
        n.status = status === 'failed' ? 'failed' : n.incidents.length ? 'partial' : 'delivered';
        n.completedAt = new Date().toISOString();
        n.lines.forEach((l) => {
          if (l.checkStatus === 'unchecked') l.checkStatus = 'ok';
        });
      },
    );
    router.back();
  };

  return (
    <Section title="Terminer la livraison">
      <PhotoField label={settings?.requireSignedBlPhoto ? 'Photo du BL signé (obligatoire)' : 'Photo du BL signé'} photos={photo} onChange={setPhoto} max={2} />
      <Text className="text-sm">Nom du signataire (facultatif)</Text>
      <Input value={signer} onChangeText={setSigner} placeholder="ex. M. Dupont" className="h-12" />
      {settings?.temperatureEnabled ? (
        <>
          <Text className="text-sm">Température à la livraison (°C){settings.temperatureRequired ? '' : ' (facultatif)'}</Text>
          <NumberInput value={temp} onChange={setTemp} placeholder="ex. -18" />
        </>
      ) : null}
      {error ? <Text className="text-destructive">{error}</Text> : null}
      <BigButton label="Livraison terminée" icon={CheckIcon} onPress={() => complete('delivered')} />
      {!failing ? (
        <Button variant="ghost" onPress={() => setFailing(true)}>
          <Text className="text-destructive">Je n'ai pas pu livrer</Text>
        </Button>
      ) : (
        <View className="gap-2 rounded-lg border border-red-300 p-3">
          <Textarea value={failReason} onChangeText={setFailReason} placeholder="Pourquoi ? (ex. client fermé, injoignable)" />
          <BigButton label="Confirmer : non livré" variant="destructive" onPress={() => complete('failed')} />
        </View>
      )}
    </Section>
  );
}
