import { MutationCache, QueryCache, QueryClient, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, errorMessage } from "./api";

function notify(e: unknown) {
  if (e instanceof ApiError && e.status === 401) return; // déconnexion gérée par le client API
  const msg = errorMessage(e);
  if (msg) toast.error(msg);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (e, q) => !q.meta?.silent && notify(e) }),
  mutationCache: new MutationCache({ onError: notify }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

/** Mutation avec invalidation de clés et toast de succès optionnel. */
export function useApiMutation<TVars, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { invalidate?: QueryKey[]; success?: string | ((data: TData, vars: TVars) => string | null); onSuccess?: (data: TData, vars: TVars) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      for (const key of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: key });
      const msg = typeof opts.success === "function" ? opts.success(data, vars) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(data, vars);
    },
  });
}
