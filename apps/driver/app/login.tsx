// Connexion : code du dépôt (mémorisé), choix du nom dans la liste, puis code PIN.
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEPOT_KEY = 'me.depotCode';

export default function Login() {
  const { signIn } = useSession();
  const [depot, setDepot] = React.useState('');
  const [drivers, setDrivers] = React.useState<{ login: string; name: string }[] | null>(null);
  const [selected, setSelected] = React.useState<{ login: string; name: string } | null>(null);
  const [manualLogin, setManualLogin] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const loadDrivers = React.useCallback(async (code: string) => {
    setError(null);
    try {
      const list = await api<{ login: string; name: string }[]>('GET', `/auth/drivers?depot=${encodeURIComponent(code)}`);
      setDrivers(list);
      if (!list.length) setError('Aucun chauffeur pour ce code dépôt');
      else await AsyncStorage.setItem(DEPOT_KEY, code);
    } catch {
      setError('Impossible de joindre le serveur. Vérifiez la connexion.');
    }
  }, []);

  React.useEffect(() => {
    AsyncStorage.getItem(DEPOT_KEY).then((c) => {
      if (c) {
        setDepot(c);
        void loadDrivers(c);
      }
    });
  }, [loadDrivers]);

  const submit = async (code: string) => {
    const login = selected?.login ?? manualLogin.trim();
    if (!login) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; mustChangePin: boolean }>('POST', '/auth/driver-login', { login, pin: code });
      await signIn(r.token);
      router.replace(r.mustChangePin ? '/change-pin' : '/home');
    } catch (e) {
      setPin('');
      setError(e instanceof ApiError ? e.message : 'Pas de connexion : la première connexion du jour demande du réseau');
    } finally {
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy) return;
    if (d === '⌫') return setPin((p) => p.slice(0, -1));
    const next = (pin + d).slice(0, 6);
    setPin(next);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-grow items-center justify-center p-6">
        <View className="w-full max-w-sm gap-6">
          <View className="items-center gap-1">
            <Text className="text-3xl font-bold">ME Tournée</Text>
            <Text className="text-muted-foreground">Maison Esclaire · app chauffeur</Text>
          </View>

          {!selected ? (
            <>
              <View className="gap-2">
                <Text className="text-sm">Code du dépôt</Text>
                <View className="flex-row gap-2">
                  <Input value={depot} onChangeText={(t) => setDepot(t.toUpperCase())} autoCapitalize="characters" placeholder="ex. SOFRILOG" className="h-12 flex-1" onSubmitEditing={() => loadDrivers(depot)} />
                  <Button className="h-12" onPress={() => loadDrivers(depot)}>
                    <Text>OK</Text>
                  </Button>
                </View>
              </View>
              {drivers?.length ? (
                <View className="gap-2">
                  <Text className="text-sm">Qui êtes-vous ?</Text>
                  {drivers.map((d) => (
                    <Pressable key={d.login} onPress={() => setSelected(d)} className="h-14 flex-row items-center justify-between rounded-lg border border-border bg-card px-4 active:bg-accent">
                      <Text className="text-lg font-medium">{d.name}</Text>
                      <Text className="text-muted-foreground">{d.login}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View className="gap-2">
                <Text className="text-sm text-muted-foreground">Ou saisissez votre identifiant</Text>
                <View className="flex-row gap-2">
                  <Input value={manualLogin} onChangeText={(t) => setManualLogin(t.toUpperCase())} autoCapitalize="characters" placeholder="ex. CH01" className="h-12 flex-1" />
                  <Button variant="outline" className="h-12" disabled={!manualLogin.trim()} onPress={() => setSelected({ login: manualLogin.trim(), name: manualLogin.trim() })}>
                    <Text>Suivant</Text>
                  </Button>
                </View>
              </View>
            </>
          ) : (
            <View className="gap-5">
              <Pressable onPress={() => { setSelected(null); setPin(''); setError(null); }}>
                <Text className="text-center text-lg">
                  {selected.name} · <Text className="text-primary underline">changer</Text>
                </Text>
              </Pressable>
              <View className="flex-row justify-center gap-3">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                  <View key={i} className={cn('h-4 w-4 rounded-full border border-foreground', i < pin.length && 'bg-foreground')} />
                ))}
              </View>
              <View className="flex-row flex-wrap justify-center gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) =>
                  d ? (
                    <Pressable key={i} onPress={() => press(d)} className="h-16 w-[28%] items-center justify-center rounded-xl bg-secondary active:bg-accent">
                      <Text className="text-2xl font-semibold">{d}</Text>
                    </Pressable>
                  ) : (
                    <View key={i} className="h-16 w-[28%]" />
                  ),
                )}
              </View>
              <Button size="lg" className="h-14" disabled={pin.length < 4 || busy} onPress={() => submit(pin)}>
                <Text className="text-base">{busy ? 'Connexion…' : 'Se connecter'}</Text>
              </Button>
            </View>
          )}

          {error ? <Text className="text-center text-destructive">{error}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
