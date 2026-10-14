// La tournée : liste des clients dans l'ordre de passage.
import { BigButton, Screen, StatusPill } from '@/components/app';
import { Text } from '@/components/ui/text';
import { startTracking, stopTracking } from '@/lib/gps';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ArrowRightIcon, MessageSquareWarningIcon, PackageOpenIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

export default function TourScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tour = useStore((s) => s.today?.tours.find((t) => t.id === id));

  React.useEffect(() => {
    if (tour?.status === 'in_progress') void startTracking(tour.id);
    else void stopTracking();
  }, [tour?.id, tour?.status]);

  if (!tour) return <Screen><Text>Tournée introuvable.</Text></Screen>;

  const notes = [...tour.notes].sort((a, b) => a.sequence - b.sequence);
  const done = notes.filter((n) => ['delivered', 'partial', 'failed'].includes(n.status)).length;
  const next = notes.find((n) => !['delivered', 'partial', 'failed'].includes(n.status));

  return (
    <>
      <Stack.Screen options={{ title: tour.name }} />
      <Screen>
        <View className="gap-2">
          <Text className="text-lg font-semibold">
            {done}/{notes.length} clients faits
          </Text>
          <View className="h-2 overflow-hidden rounded-full bg-secondary">
            <View className="h-2 bg-emerald-500" style={{ width: `${notes.length ? (done / notes.length) * 100 : 0}%` }} />
          </View>
        </View>

        {tour.status === 'in_progress' && next ? (
          <BigButton label={`Client suivant : ${next.clientSnapshot.name}`} icon={ArrowRightIcon} onPress={() => router.push(`/stop/${next.id}`)} />
        ) : null}

        {notes.map((n, i) => (
          <Pressable
            key={n.id}
            disabled={tour.status !== 'in_progress' && tour.status !== 'returned'}
            onPress={() => router.push(`/stop/${n.id}`)}
            className={cn('gap-1 rounded-xl border bg-card p-4 active:bg-accent', n.id === next?.id ? 'border-primary' : 'border-border')}>
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-base font-semibold" numberOfLines={1}>
                {i + 1}. {n.clientSnapshot.name}
              </Text>
              <StatusPill status={n.status} />
            </View>
            <Text className="text-muted-foreground" numberOfLines={1}>
              {[...n.clientSnapshot.addressLines, `${n.clientSnapshot.postalCode ?? ''} ${n.clientSnapshot.city ?? ''}`].join(', ')}
            </Text>
            <View className="flex-row flex-wrap items-center gap-3">
              {n.windowStart ? (
                <Text className="text-sm font-medium">
                  {n.windowStart}–{n.windowEnd}
                </Text>
              ) : null}
              <Text className="text-sm">{n.packageCount ?? '?'} colis</Text>
              {n.comment ? (
                <View className="flex-row items-center gap-1">
                  <MessageSquareWarningIcon size={14} color="#d97706" />
                  <Text className="text-sm text-amber-600" numberOfLines={1}>
                    {n.comment.split('\n')[0]}
                  </Text>
                </View>
              ) : null}
              {n.pickupRequested ? (
                <View className="flex-row items-center gap-1">
                  <PackageOpenIcon size={14} color="#7c3aed" />
                  <Text className="text-sm text-violet-600">Reprise</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ))}

        {tour.status === 'in_progress' ? (
          <BigButton
            label="Retour au dépôt"
            variant={next ? 'outline' : 'default'}
            onPress={() => router.push(`/return/${tour.id}`)}
          />
        ) : null}
        {tour.status === 'returned' ? <Text className="text-center text-emerald-600">Tournée terminée, merci !</Text> : null}
      </Screen>
    </>
  );
}
