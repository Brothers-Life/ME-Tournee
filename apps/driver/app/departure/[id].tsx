// Départ : choix du camion (plaque ou n° de parc) et contrôle avant de partir.
import { BigButton, NumberInput, PhotoField, Screen, Section, toNumber, YesNo, type PhotoRef } from '@/components/app';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Textarea } from '@/components/ui/textarea';
import { act, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { router, useLocalSearchParams } from 'expo-router';
import { TruckIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

export default function Departure() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useStore((s) => s.today);
  const tour = today?.tours.find((t) => t.id === id);
  const settings = today?.depot?.settings;

  const [search, setSearch] = React.useState('');
  const [vehicleId, setVehicleId] = React.useState<string | null>(tour?.vehicleId ?? null);
  const [km, setKm] = React.useState('');
  const [kmPhoto, setKmPhoto] = React.useState<PhotoRef[]>([]);
  const [clean, setClean] = React.useState<boolean | null>(null);
  const [fuel, setFuel] = React.useState<boolean | null>(null);
  const [lights, setLights] = React.useState<boolean | null>(null);
  const [fridge, setFridge] = React.useState<boolean | null>(null);
  const [temp, setTemp] = React.useState('');
  const [palettes, setPalettes] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [photos, setPhotos] = React.useState<PhotoRef[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  if (!tour || !today) return <Screen><Text>Tournée introuvable.</Text></Screen>;

  const vehicles = today.vehicles.filter((v) => {
    const q = search.trim().toUpperCase();
    return !q || v.plate.replace(/-/g, '').includes(q.replace(/-/g, '')) || (v.fleetNumber ?? '').toUpperCase().includes(q);
  });
  const vehicle = today.vehicles.find((v) => v.id === vehicleId);
  const showPalettes = !!settings?.palettesEnabled && !!vehicle && settings.palettesVehicleTypes.includes(vehicle.type);
  const anomaly = clean === false || lights === true || fridge === false;

  const submit = () => {
    setError(null);
    if (!vehicleId) return setError('Choisissez votre camion');
    const kmN = toNumber(km);
    if (kmN === null) return setError('Indiquez le kilométrage');
    if (clean === null || fuel === null || lights === null || fridge === null) return setError('Répondez à toutes les questions du contrôle');
    if (anomaly && !comment.trim() && photos.length === 0) return setError('Décrivez le problème ou prenez une photo');
    const temperature = toNumber(temp);
    if (settings?.temperatureEnabled && settings.temperatureRequired && temperature === null) return setError('Relevé de température obligatoire');
    act(
      'Départ du dépôt',
      'POST',
      `/driver/tours/${tour.id}/departure`,
      {
        vehicleId, km: Math.round(kmN), kmPhotoId: kmPhoto[0]?.id ?? null, clean, fuelFull: fuel, warningLights: lights, fridgeOk: fridge,
        temperature: settings?.temperatureEnabled ? temperature : null, palettes: showPalettes ? toNumber(palettes) : null,
        comment: comment.trim() || null, photoIds: photos.map((p) => p.id),
      },
      (t) => {
        const tt = t.tours.find((x) => x.id === tour.id);
        if (tt) {
          tt.status = 'in_progress';
          tt.vehicleId = vehicleId;
          tt.checks.push({ kind: 'departure', km: Math.round(kmN) });
        }
        if (!t.shift) t.shift = { id: 'local', startAt: new Date().toISOString(), endAt: null, breakStartedAt: null, breakMinutes: 0 };
      },
    );
    router.replace(`/tour/${tour.id}`);
  };

  return (
    <Screen>
      <Text className="text-xl font-bold">{tour.name}</Text>

      <Section title="Mon camion">
        <Input value={search} onChangeText={setSearch} placeholder="Plaque ou n° de parc (ex. 12, GA-123)" autoCapitalize="characters" className="h-12" />
        <View className="gap-2">
          {vehicles.slice(0, 8).map((v) => (
            <Pressable
              key={v.id}
              onPress={() => setVehicleId(v.id)}
              className={cn('flex-row items-center gap-3 rounded-lg border p-3', vehicleId === v.id ? 'border-primary bg-primary/10' : 'border-border')}>
              <TruckIcon size={20} />
              <View className="flex-1">
                <Text className="font-semibold">
                  {v.fleetNumber ? `N° ${v.fleetNumber} · ` : ''}
                  {v.plate}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {v.type}
                  {v.label ? ` · ${v.label}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
          {vehicles.length === 0 ? <Text className="text-muted-foreground">Aucun camion ne correspond.</Text> : null}
        </View>
      </Section>

      <Section title="Contrôle avant départ">
        <Text className="text-sm">Kilométrage au compteur</Text>
        <NumberInput value={km} onChange={setKm} placeholder="ex. 120500" />
        <PhotoField label="Photo du compteur (conseillé)" photos={kmPhoto} onChange={setKmPhoto} max={1} />
        <YesNo label="Le camion est propre ?" value={clean} onChange={setClean} />
        <YesNo label="Le plein est fait ?" value={fuel} onChange={setFuel} />
        <YesNo label="Un voyant est allumé ?" value={lights} onChange={setLights} good={false} />
        <YesNo label="Le groupe froid fonctionne ?" value={fridge} onChange={setFridge} />
        {settings?.temperatureEnabled ? (
          <>
            <Text className="text-sm">Température du caisson (°C){settings.temperatureRequired ? '' : ' (facultatif)'}</Text>
            <NumberInput value={temp} onChange={setTemp} placeholder="ex. -20" />
          </>
        ) : null}
        {showPalettes ? (
          <>
            <Text className="text-sm">Nombre de palettes chargées</Text>
            <NumberInput value={palettes} onChange={setPalettes} placeholder="ex. 4" />
          </>
        ) : null}
        <Text className="text-sm">{anomaly ? 'Décrivez le problème' : 'Autre remarque (facultatif)'}</Text>
        <Textarea value={comment} onChangeText={setComment} placeholder="ex. rayure porte arrière" />
        <PhotoField label={anomaly ? 'Photos du problème' : 'Photos (facultatif)'} photos={photos} onChange={setPhotos} />
        {anomaly ? <Text className="text-amber-600">Le responsable sera prévenu de cette anomalie.</Text> : null}
      </Section>

      {error ? <Text className="text-center text-destructive">{error}</Text> : null}
      <BigButton label="Partir en tournée" onPress={submit} />
    </Screen>
  );
}
