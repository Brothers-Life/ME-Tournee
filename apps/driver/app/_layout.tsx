import '@/global.css';

import { NAV_THEME } from '@/lib/theme';
import { SessionProvider } from '@/lib/session';
import { flush } from '@/lib/store';
import { ThemeProvider } from 'expo-router/react-navigation';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { AppState, Platform } from 'react-native';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  // Relance l'envoi des actions en attente au retour du réseau ou de l'app au premier plan.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void flush());
    const retry = setInterval(() => void flush(), 30_000);
    const online = () => void flush();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', online);
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => {
      sub.remove();
      clearInterval(retry);
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('online', online);
    };
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerBackTitle: 'Retour' }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="change-pin" options={{ title: 'Nouveau code PIN' }} />
          <Stack.Screen name="home" options={{ title: 'Ma journée' }} />
          <Stack.Screen name="tour/[id]" options={{ title: 'Tournée' }} />
          <Stack.Screen name="departure/[id]" options={{ title: 'Départ du dépôt' }} />
          <Stack.Screen name="stop/[id]" options={{ title: 'Livraison' }} />
          <Stack.Screen name="return/[id]" options={{ title: 'Retour au dépôt' }} />
        </Stack>
        <PortalHost />
      </ThemeProvider>
    </SessionProvider>
  );
}
