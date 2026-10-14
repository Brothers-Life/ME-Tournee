// Retour au dépôt : km, propreté, palettes, photos des retours.
import { BigButton, NumberInput, PhotoField, Screen, Section, toNumber, YesNo, type PhotoRef } from '@/components/app';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { stopTracking } from '@/lib/gps';
import { act, useStore } from '@/lib/store';
import { router, useLocalSearchParams } from 'expo-router';
import * as React from 'react';

export default function Return() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useStore((s) => s.today);
  const tour = today?.tours.find((t) => t.id === id);
  const settings = today?.depot?.settings;
  const [km, setKm] = React.useState('');
  const [kmPhoto, setKmPhoto] = React.useState<PhotoRef[]>([]);
  const [cleaned, setCleaned] = React.useState<boolean | null>(null);
  const [temp, setTemp] = React.useState('');
  const [palettes, setPalettes] = React.useState('');
  const [photos, setPhotos] = React.useState<PhotoRef[]>([]);
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  if (!tour || !today) return <Screen><Text>Tournée introuvable.</Text></Screen>;
  const remaining = tour.notes.filter((n) => !['delivered', 'partial', 'failed'].includes(n.status));
  const departureKm = tour.checks.find((c) => c.kind === 'departure')?.km;
  const vehicle = today.vehicles.find((v) => v.id === tour.vehicleId);
  const showPalettes = !!settings?.palettesEnabled && !!vehicle && settings.palettesVehicleTypes.includes(vehicle.type);
  const hasReturns = tour.notes.some((n) => n.incidents.some((i) => /repris/i.test(i.action ?? '')) || n.pickup?.done);

  const submit = () => {
    setError(null);
    if (remaining.length) return setError(`Il reste ${remaining.length} client(s) sans statut`);
    const kmN = toNumber(km);
    if (kmN === null) return setError('Indiquez le kilométrage');
    if (departureKm !== undefined && kmN < departureKm) return setError(`Le kilométrage doit être supérieur à celui du départ (${departureKm})`);
    if (cleaned === null) return setError('Indiquez si le camion est nettoyé');
    if (hasReturns && photos.length === 0) return setError('Prenez en photo les retours déposés');
    act(
      'Retour au dépôt',
      'POST',
      `/driver/tours/${tour.id}/return`,
      {
        km: Math.round(kmN), kmPhotoId: kmPhoto[0]?.id ?? null, cleaned, temperature: settings?.temperatureEnabled ? toNumber(temp) : null,
        palettes: showPalettes ? toNumber(palettes) : null, returnsPhotoIds: photos.map((p) => p.id), comment: comment.trim() || null,
      },
      (t) => {
        const tt = t.tours.find((x) => x.id === tour.id);
        if (tt) tt.status = 'returned';
      },
    );
    void stopTracking();
    router.replace('/home');
  };

  return (
    <Screen>
      <Text className="text-xl font-bold">{tour.name}</Text>
      {remaining.length ? (
        <Section>
          <Text className="text-destructive">
            Il reste {remaining.length} client(s) à livrer ou à marquer « non livré » avant le retour.
          </Text>
        </Section>
      ) : null}
      <Section title="Fin de tournée">
        <Text className="text-sm">Kilométrage au retour{departureKm !== undefined ? ` (départ : ${departureKm})` : ''}</Text>
        <NumberInput value={km} onChange={setKm} placeholder="ex. 120688" />
        <PhotoField label="Photo du compteur (conseillé)" photos={kmPhoto} onChange={setKmPhoto} max={1} />
        <YesNo label="Le camion est nettoyé et rangé ?" value={cleaned} onChange={setCleaned} />
        {settings?.temperatureEnabled ? (
          <>
            <Text className="text-sm">Température du caisson (°C, facultatif)</Text>
            <NumberInput value={temp} onChange={setTemp} placeholder="ex. -20" />
          </>
        ) : null}
        {showPalettes ? (
          <>
            <Text className="text-sm">Palettes vides rapportées</Text>
            <NumberInput value={palettes} onChange={setPalettes} placeholder="ex. 3" />
          </>
        ) : null}
        <PhotoField label={hasReturns ? 'Photos des retours déposés (obligatoire)' : 'Photos des retours (si besoin)'} photos={photos} onChange={setPhotos} />
        <Textarea value={comment} onChangeText={setComment} placeholder="Remarque (facultatif)" />
      </Section>
      {error ? <Text className="text-center text-destructive">{error}</Text> : null}
      <BigButton label="Valider le retour" onPress={submit} disabled={remaining.length > 0} />
      <Text className="text-center text-sm text-muted-foreground">Pensez à faire votre fin de poste depuis l'écran « Ma journée ».</Text>
    </Screen>
  );
}
