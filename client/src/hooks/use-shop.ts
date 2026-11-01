import { useMutation } from "@tanstack/react-query";
import type { UserProfile, ShopItemId, LotusCheckpoint, SkinId } from "@shared/schema";

export function useBuyItem(token?: string) {
  return useMutation({
    mutationFn: async (itemId: ShopItemId): Promise<UserProfile> => {
      if (!token) throw new Error("Login required");
      const res = await fetch('/api/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Purchase failed');
      return data.profile;
    },
  });
}

export function useBuySkin(token?: string) {
  return useMutation({
    mutationFn: async (skinId: SkinId): Promise<UserProfile> => {
      if (!token) throw new Error("Login required");
      const res = await fetch('/api/shop/skins/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skinId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Skin purchase failed');
      return data.profile;
    },
  });
}

export function useEquipSkin(token?: string) {
  return useMutation({
    mutationFn: async (skinId: SkinId): Promise<UserProfile> => {
      if (!token) throw new Error("Login required");
      const res = await fetch('/api/shop/skins/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skinId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not equip skin');
      return data.profile;
    },
  });
}

export function usePlaceLotus(token?: string) {
  return useMutation({
    mutationFn: async (checkpoint: LotusCheckpoint): Promise<UserProfile> => {
      if (!token) throw new Error("Login required");
      const res = await fetch('/api/user/place-lotus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(checkpoint),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to plant Lotus');
      return data.profile;
    },
  });
}

export function useUseLotus(token?: string) {
  return useMutation({
    mutationFn: async (): Promise<UserProfile> => {
      if (!token) throw new Error("Login required");
      const res = await fetch('/api/user/use-lotus', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to use Lotus');
      return data.profile;
    },
  });
}

export function useUpgradeHardDrive(token?: string) {
  return useMutation({
    mutationFn: async (): Promise<UserProfile> => {
      if (!token) throw new Error("Login required");
      const res = await fetch('/api/user/upgrade-harddrive', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upgrade failed');
      return data.profile;
    },
  });
}

export function useUpgradeCpu(token?: string) {
  return useMutation({
    mutationFn: async (): Promise<UserProfile> => {
      if (!token) throw new Error("Login required");
      const res = await fetch('/api/user/upgrade-cpu', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upgrade failed');
      return data.profile;
    },
  });
}

export function useClaimCpuCoins(token?: string) {
  return useMutation({
    mutationFn: async (): Promise<{ coins: number; profile: UserProfile }> => {
      if (!token) throw new Error("Login required");
      const res = await fetch('/api/user/claim-cpu-coins', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Claim failed');
      return { coins: data.coins, profile: data.profile };
    },
  });
}

export function useRedeemCode(token?: string) {
  return useMutation({
    mutationFn: async (code: string): Promise<UserProfile> => {
      if (!token) throw new Error("Login required");
      const res = await fetch('/api/user/redeem-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Redeem failed');
      return data.profile;
    },
  });
}

export function useOpenCase(token?: string) {
  return useMutation({
    mutationFn: async (): Promise<{ success: boolean; skin: any; isNew: boolean; refund: number; profile: UserProfile }> => {
      if (!token) throw new Error("Login required");
      const res = await fetch('/api/shop/case/open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to open case');
      return data;
    },
  });
}
