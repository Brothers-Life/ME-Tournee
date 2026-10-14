import * as React from 'react';
import { api, loadToken, setToken } from './api';
import { hydrate, refresh, resetStore } from './store';
import type { Me } from './types';

interface SessionValue {
  ready: boolean;
  me: Me | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  reloadMe: () => Promise<void>;
}

const Ctx = React.createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [me, setMe] = React.useState<Me | null>(null);

  const reloadMe = React.useCallback(async () => {
    setMe(await api<Me>('GET', '/me'));
  }, []);

  React.useEffect(() => {
    (async () => {
      await hydrate();
      const t = await loadToken();
      if (t) {
        try {
          await reloadMe();
          void refresh().catch(() => {});
        } catch (e) {
          // Hors-ligne : on garde la session locale ; jeton expiré : retour à la connexion.
          if ((e as { status?: number }).status === 401) await setToken(null);
          else setMe({ user: { id: '', firstName: '', lastName: '', login: null, mustChangePin: false } });
        }
      }
      setReady(true);
    })();
  }, [reloadMe]);

  const value = React.useMemo<SessionValue>(
    () => ({
      ready,
      me,
      reloadMe,
      signIn: async (token) => {
        await setToken(token);
        await resetStore();
        await reloadMe();
        await refresh();
      },
      signOut: async () => {
        await api('POST', '/auth/logout').catch(() => {});
        await setToken(null);
        await resetStore();
        setMe(null);
      },
    }),
    [ready, me, reloadMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('SessionProvider manquant');
  return v;
}
