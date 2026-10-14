import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/session';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  const { ready, me } = useSession();
  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator />
        <Text className="text-muted-foreground">Chargement…</Text>
      </View>
    );
  }
  if (!me) return <Redirect href="/login" />;
  if (me.user.mustChangePin) return <Redirect href="/change-pin" />;
  return <Redirect href="/home" />;
}
