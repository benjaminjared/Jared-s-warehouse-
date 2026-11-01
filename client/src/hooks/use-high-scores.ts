import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { UserProfile, LeaderboardEntry, PublicProfile } from "@shared/schema";

export function useHighScores(limit: number = 10) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: [api.highScores.list.path, limit],
    queryFn: async () => {
      const url = new URL(api.highScores.list.path, window.location.origin);
      url.searchParams.append("limit", limit.toString());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch high scores");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useSubmitHighScore(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { score: number; cudaCoresCollected: number; distance: number; flopsCollected?: number; rareCds?: number; pcBuildFast?: boolean }): Promise<LeaderboardEntry & { profile: UserProfile | null }> => {
      if (!token) throw new Error("Login required to submit score");
      const res = await fetch(api.highScores.create.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to submit score');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.highScores.list.path] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
    },
  });
}

export function usePublicProfile(userId: number | null | undefined) {
  return useQuery<PublicProfile>({
    queryKey: ['/api/players', userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/players/${userId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to load player');
      }
      return res.json();
    },
    staleTime: 15_000,
  });
}

export function useAwardCoins(token?: string) {
  return useMutation({
    mutationFn: async (cudaCores: number): Promise<{ coinsEarned: number; profile: UserProfile }> => {
      if (!token) throw new Error("Not authenticated");
      const res = await fetch('/api/user/award-coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cudaCores }),
      });
      if (!res.ok) throw new Error('Failed to award coins');
      return res.json();
    },
  });
}
