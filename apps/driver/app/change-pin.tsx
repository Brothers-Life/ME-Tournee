import { Screen, Section } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { router } from 'expo-router';
import * as React from 'react';

export default function ChangePin() {
  const { reloadMe } = useSession();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!/^\d{4,6}$/.test(next)) return setError('Le nouveau PIN doit faire 4 à 6 chiffres');
    if (next !== confirm) return setError('Les deux PIN ne correspondent pas');
    try {
      await api('POST', '/me/driver-pin', { currentPin: current, newPin: next });
      await reloadMe();
      router.replace('/home');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Pas de connexion');
    }
  };

  const field = (label: string, value: string, set: (v: string) => void) => (
    <>
      <Text className="text-sm">{label}</Text>
      <Input value={value} onChangeText={(t) => set(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry className="h-12 text-lg" />
    </>
  );

  return (
    <Screen>
      <Section title="Choisissez votre code PIN personnel">
        <Text className="text-muted-foreground">Le PIN donné par votre responsable est provisoire. Choisissez-en un que vous seul connaissez.</Text>
        {field('PIN actuel', current, setCurrent)}
        {field('Nouveau PIN (4 à 6 chiffres)', next, setNext)}
        {field('Confirmez le nouveau PIN', confirm, setConfirm)}
        {error ? <Text className="text-destructive">{error}</Text> : null}
        <Button size="lg" className="h-14" onPress={save}>
          <Text className="text-base">Enregistrer</Text>
        </Button>
      </Section>
    </Screen>
  );
}
