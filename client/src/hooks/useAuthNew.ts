import { trpc } from "@/lib/trpc";

export function useAuth() {
  const { data: user, isLoading: loading, error } = trpc.auth.me.useQuery();

  return {
    user: user || null,
    loading,
    error,
    isAuthenticated: !!user,
  };
}
