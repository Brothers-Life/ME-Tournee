// Ma journée : pointage et tournées du jour.
import { BigButton, Screen, Section } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/session';
import { act, refresh, useStore } from '@/lib/store';
import type { Tour } from '@/lib/types';
import { cn } from '@/lib/utils';
import { TOUR_STATUS_LABELS } from '@me/shared';
import { router, Stack } from 'expo-router';
import { CoffeeIcon, LogOutIcon, PlayIcon, SquareIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default function Home() {
  const { me, signOut } = useSession();
  const today = useStore((s) => s.today);
  const [refreshing, setRefreshing] = React.useState(false);

  const reload = React.useCallback(async () => {
    setRefreshing(true);
    await refresh().catch(() => {});
    setRefreshing(false);
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const shift = today?.shift ?? null;
  const now = new Date().toISOString();

  const startShift = () =>
    act('Prise de poste', 'POST', '/driver/shift/start', { at: now }, (t) => {
      t.shift = { id: 'local', startAt: now, endAt: null, breakStartedAt: null, breakMinutes: 0 };
    });
  const toggleBreak = () =>
    act(shift?.breakStartedAt ? 'Fin de pause' : 'Début de pause', 'POST', '/driver/shift/break', { at: now }, (t) => {
      if (!t.shift) return;
      if (t.shift.breakStartedAt) {
        t.shift.breakMinutes += Math.round((Date.now() - new Date(t.shift.breakStartedAt).getTime()) / 60000);
        t.shift.breakStartedAt = null;
      } else t.shift.breakStartedAt = now;
    });
  const endShift = () =>
    act('Fin de poste', 'POST', '/driver/shift/end', { at: now }, (t) => {
      t.shift = null;
    });

  const busyTour = today?.tours.find((t) => t.status === 'in_progress');

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button variant="ghost" size="sm" onPress={async () => { await signOut(); router.replace('/login'); }}>
              <LogOutIcon size={18} />
            </Button>
          ),
        }}
      />
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}>
        <View className="gap-1">
          <Text className="text-2xl font-bold">Bonjour {me?.user.firstName}</Text>
          <Text className="text-muted-foreground">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {today?.depot ? ` · ${today.depot.name}` : ''}
          </Text>
        </View>

        <Section title="Pointage">
          {!shift ? (
            <BigButton label="Prendre mon poste" icon={PlayIcon} onPress={startShift} />
          ) : (
            <>
              <Text>
                En poste depuis {hm(shift.startAt)}
                {shift.breakMinutes ? ` · ${shift.breakMinutes} min de pause` : ''}
              </Text>
              {shift.breakStartedAt ? <Text className="font-semibold text-amber-600">En pause depuis {hm(shift.breakStartedAt)}</Text> : null}
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <BigButton label={shift.breakStartedAt ? 'Reprendre' : 'Pause'} variant="outline" icon={CoffeeIcon} onPress={toggleBreak} />
                </View>
                <View className="flex-1">
                  <BigButton label="Fin de poste" variant="destructive" icon={SquareIcon} disabled={!!busyTour} onPress={endShift} />
                </View>
              </View>
              {busyTour ? <Text className="text-xs text-muted-foreground">Terminez la tournée en cours avant la fin de poste.</Text> : null}
            </>
          )}
        </Section>

        <Text className="text-lg font-semibold">Mes tournées</Text>
        {!today ? (
          <Text className="text-muted-foreground">Chargement de la journée…</Text>
        ) : today.tours.length === 0 ? (
          <Section>
            <Text className="text-muted-foreground">Aucune tournée validée pour vous aujourd'hui. Tirez vers le bas pour actualiser.</Text>
          </Section>
        ) : (
          today.tours.map((t) => <TourCard key={t.id} tour={t} />)
        )}
      </Screen>
    </>
  );
}

function TourCard({ tour }: { tour: Tour }) {
  const done = tour.notes.filter((n) => ['delivered', 'partial', 'failed'].includes(n.status)).length;
  const packages = tour.notes.reduce((a, n) => a + (n.packageCount ?? 0), 0);
  const go = () => {
    if (tour.status === 'validated') router.push(`/departure/${tour.id}`);
    else router.push(`/tour/${tour.id}`);
  };
  return (
    <Pressable onPress={go} className="gap-2 rounded-xl border border-border bg-card p-4 active:bg-accent">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-semibold">{tour.name}</Text>
        <View className={cn('rounded-full px-2 py-0.5', tour.status === 'in_progress' ? 'bg-sky-200 dark:bg-sky-800' : tour.status === 'returned' ? 'bg-emerald-200 dark:bg-emerald-800' : 'bg-zinc-200 dark:bg-zinc-700')}>
          <Text className="text-xs font-medium">{TOUR_STATUS_LABELS[tour.status]}</Text>
        </View>
      </View>
      <Text className="text-muted-foreground">
        {tour.notes.length} client{tour.notes.length > 1 ? 's' : ''} · {packages} colis · {done}/{tour.notes.length} faits
      </Text>
      <Text className="font-medium text-primary">
        {tour.status === 'validated' ? 'Contrôler le camion et partir →' : tour.status === 'in_progress' ? 'Continuer la tournée →' : 'Voir le détail →'}
      </Text>
    </Pressable>
  );
}
