// Session du panel : jeton, profil (/me), dépôt et date courants, permissions, verrouillage.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { can as canPerm, type Permission } from "@me/shared";
import { api, getToken, onTokenChange, setToken } from "./api";
import { todayParis } from "./format";
import type { Depot, Me } from "./types";

const DEPOT_KEY = "me.depot";
const DATE_KEY = "me.date";
const LOCK_KEY = "me.locked";
export const LOCK_AFTER_MS = 15 * 60 * 1000;

function storageGet(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function storageSet(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    /* ignoré */
  }
}
const local = () => localStorage;
const session = () => sessionStorage;

export type LoginResult = { ok: true } | { needTotp: true };

interface AuthContextValue {
  token: string | null;
  me: Me | undefined;
  meLoading: boolean;
  depots: Depot[];
  depot: Depot | null;
  depotId: string | null;
  setDepotId: (id: string) => void;
  date: string;
  setDate: (d: string) => void;
  /** Permission dans le dépôt courant (ou globale avec depotId = null explicite). */
  can: (perm: Permission, depotId?: string | null) => boolean;
  /** Permission dans au moins un dépôt. */
  canAny: (perm: Permission) => boolean;
  login: (email: string, password: string, totp?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setTokenState] = useState<string | null>(getToken());
  const [storedDepot, setStoredDepot] = useState<string | null>(() => storageGet(local, DEPOT_KEY));
  const [date, setDateState] = useState<string>(() => storageGet(session, DATE_KEY) ?? todayParis());
  const [locked, setLocked] = useState<boolean>(() => !!getToken() && storageGet(local, LOCK_KEY) === "1");

  useEffect(
    () =>
      onTokenChange((t) => {
        setTokenState(t);
        if (!t) {
          qc.clear();
          setLocked(false);
          storageSet(local, LOCK_KEY, null);
        }
      }),
    [qc],
  );

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("/me"),
    enabled: !!token,
    staleTime: 60_000,
  });
  const me = token ? meQuery.data : undefined;
  const depots = useMemo(() => me?.depots ?? [], [me]);
  const depot = depots.find((d) => d.id === storedDepot) ?? depots[0] ?? null;
  const depotId = depot?.id ?? null;

  const setDepotId = useCallback((id: string) => {
    setStoredDepot(id);
    storageSet(local, DEPOT_KEY, id);
  }, []);

  const setDate = useCallback((d: string) => {
    setDateState(d);
    storageSet(session, DATE_KEY, d);
  }, []);

  const can = useCallback(
    (perm: Permission, d?: string | null) => {
      if (!me) return false;
      return canPerm(me.permissions, perm, d === undefined ? depotId : d);
    },
    [me, depotId],
  );
  const canAny = useCallback((perm: Permission) => (me ? canPerm(me.permissions, perm) : false), [me]);

  const login = useCallback(
    async (email: string, password: string, totp?: string): Promise<LoginResult> => {
      const res = await api.post<{ token?: string; needTotp?: boolean }>("/auth/login", { email, password, totp: totp || undefined });
      if (res.needTotp) return { needTotp: true };
      if (!res.token) throw new Error("Réponse inattendue du serveur");
      qc.removeQueries({ queryKey: ["me"] });
      setToken(res.token);
      setLocked(false);
      storageSet(local, LOCK_KEY, null);
      return { ok: true };
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* session déjà expirée */
    }
    setToken(null);
  }, []);

  const lock = useCallback(() => {
    setLocked(true);
    storageSet(local, LOCK_KEY, "1");
  }, []);
  const unlock = useCallback(() => {
    setLocked(false);
    storageSet(local, LOCK_KEY, null);
  }, []);

  // Verrouillage après 15 minutes d'inactivité.
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    if (!token || locked) return;
    lastActivity.current = Date.now();
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;
    for (const e of events) window.addEventListener(e, bump, { passive: true });
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= LOCK_AFTER_MS) lock();
    }, 15_000);
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      window.clearInterval(timer);
    };
  }, [token, locked, lock]);

  const value: AuthContextValue = {
    token,
    me,
    meLoading: !!token && meQuery.isLoading,
    depots,
    depot,
    depotId,
    setDepotId,
    date,
    setDate,
    can,
    canAny,
    login,
    logout,
    locked,
    lock,
    unlock,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth hors AuthProvider");
  return ctx;
}
