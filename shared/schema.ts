import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").default("player").notNull(),
  cudaCoins: integer("cuda_coins").default(0).notNull(),
  revives: integer("revives").default(0).notNull(),
  headStarts: integer("head_starts").default(0).notNull(),
  luckyCharms: integer("lucky_charms").default(0).notNull(),
  overclocks: integer("overclocks").default(0).notNull(),
  hardDriveTier: integer("hard_drive_tier").default(0).notNull(),
  cpuTier: integer("cpu_tier").default(0).notNull(),
  sprintBoosts: integer("sprint_boosts").default(0).notNull(),
  coreDoublers: integer("core_doublers").default(0).notNull(),
  ghostBoosts: integer("ghost_boosts").default(0).notNull(),
  lotuses: integer("lotuses").default(0).notNull(),
  lotusCheckpoint: text("lotus_checkpoint"),
  achievements: text("achievements").default("[]").notNull(),
  ownedSkins: text("owned_skins").default("[\"default\"]").notNull(),
  equippedSkin: text("equipped_skin").default("default").notNull(),
  rareCds: integer("rare_cds").default(0).notNull(),
  runbunGifted: integer("runbun_gifted").default(0).notNull(),
  superSecretRedeemedAt: timestamp("super_secret_redeemed_at"),
  lastCodeRedeemedAt: timestamp("last_code_redeemed_at"),
  lastFreeReviveAt: timestamp("last_free_revive_at"),
  lastRemasteredAt: timestamp("last_remastered_at"),
  cpuLastClaimedAt: timestamp("cpu_last_claimed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const highScores = pgTable("high_scores", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  userId: integer("user_id"),
  password: text("password"),
  score: integer("score").notNull(),
  cudaCoresCollected: integer("flops_collected").notNull(),
  distance: integer("distance").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true, createdAt: true, role: true, cudaCoins: true, revives: true, headStarts: true,
  luckyCharms: true, overclocks: true, hardDriveTier: true, cpuTier: true,
  sprintBoosts: true, coreDoublers: true, ghostBoosts: true,
  lotuses: true, lotusCheckpoint: true,
  achievements: true, ownedSkins: true, equippedSkin: true, rareCds: true, runbunGifted: true,
  lastCodeRedeemedAt: true, lastFreeReviveAt: true, lastRemasteredAt: true, cpuLastClaimedAt: true,
  superSecretRedeemedAt: true,
});
export const insertHighScoreSchema = createInsertSchema(highScores).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type HighScore = typeof highScores.$inferSelect;
export type InsertHighScore = z.infer<typeof insertHighScoreSchema>;
export type CreateHighScoreRequest = InsertHighScore;
export type HighScoreResponse = HighScore;
export type HighScoresListResponse = HighScore[];
export type LeaderboardEntry = HighScore & { rank: RankInfo };

export type UserProfile = {
  id: number;
  username: string;
  role: string;
  cudaCoins: number;
  revives: number;
  headStarts: number;
  luckyCharms: number;
  overclocks: number;
  hardDriveTier: number;
  cpuTier: number;
  sprintBoosts: number;
  coreDoublers: number;
  ghostBoosts: number;
  lotuses: number;
  lotusCheckpoint: LotusCheckpoint | null;
  achievements: string[];
  ownedSkins: string[];
  equippedSkin: string;
  rareCds: number;
  runbunGifted: number;
  lastCodeRedeemedAt: string | null;
  lastFreeReviveAt: string | null;
  lastRemasteredAt: string | null;
  cpuLastClaimedAt: string | null;
};

export type LotusCheckpoint = {
  distance: number;
  cudaCores: number;
  score: number;
  flopsCollected: number;
  rareCds?: number;
};

export const SHOP_ITEMS = [
  { id: 'revive',      label: 'REVIVE',        desc: 'Survive one death during a run',             cost: 8,   max: 3, field: 'revives'      },
  { id: 'lotus',       label: 'LOTUS',         desc: 'Plant a checkpoint and return to it anytime', cost: 35,  max: 99, field: 'lotuses'      },
  { id: 'headstart',   label: 'HEAD START',     desc: 'Start your run with Booster active (8s)',    cost: 18,  max: 2, field: 'headStarts'   },
  { id: 'luckycharm',  label: 'LUCKY CHARM',    desc: 'Earn +25% CUDA cores for one run',           cost: 30,  max: 2, field: 'luckyCharms'  },
  { id: 'overclock',   label: 'OVERCLOCK',      desc: 'Start with JET SURGE powerup active',        cost: 50,  max: 1, field: 'overclocks'   },
  { id: 'sprint',      label: 'SPRINT BOOST',   desc: 'Start with Scarlet Rush active (8s)',         cost: 25,  max: 2, field: 'sprintBoosts' },
  { id: 'coredoubler', label: 'CORE DOUBLER',   desc: '2× CUDA core yield for one full run',        cost: 60,  max: 1, field: 'coreDoublers' },
  { id: 'ghost',       label: 'GHOST',          desc: 'Float mode + air dash for one run',          cost: 40,  max: 2, field: 'ghostBoosts'  },
] as const;

export type ShopItemId = typeof SHOP_ITEMS[number]['id'];

export const ACHIEVEMENTS = [
  { id: 'first_dash', label: 'FIRST BOOT', description: 'Complete your first warehouse dash', color: '#54e0c0' },
  { id: 'core_1000', label: 'CORE COLLECTOR', description: 'Collect 1,000 CUDA cores in one run', color: '#7bb7ff' },
  { id: 'core_10000', label: 'SILICON HOARDER', description: 'Collect 10,000 CUDA cores in one run', color: '#df78d1' },
  { id: 'distance_1000', label: 'LOADING DOCK REGULAR', description: 'Travel 1,000 meters in one run', color: '#f0c35c' },
  { id: 'distance_5000', label: 'NIGHT SHIFT', description: 'Travel 5,000 meters in one run', color: '#ff8855' },
  { id: 'flops_10', label: 'FLOPS FAN', description: 'Collect 10 FLOPS in one run', color: '#bf7cff' },
  { id: 'lotus_keeper', label: 'GARDEN LEAD', description: 'Plant a Lotus checkpoint', color: '#ff66cc' },
  { id: 'big_spender', label: 'PARTS BUYER', description: 'Purchase an item from Jeff’s Shop', color: '#ffd34d' },
  { id: 'star_employee', label: 'STAR EMPLOYEE', description: 'Complete a mandatory PC build in under 55 seconds', color: '#fff06a' },
  { id: 'redacted', label: '[REDACTED]', description: '████ ███ ██ ██████', color: '#ff2a2a', secret: true },
] as const;

export type AchievementId = typeof ACHIEVEMENTS[number]['id'];

export const SECRET_SKIN_ID = 'redacted';

export type SkinRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'super';

export const CASE_COST = 45;
export const CASE_DUPLICATE_REFUND = 20;

export const CASE_RARITY_ODDS: Record<SkinRarity, number> = {
  common: 59.99,   // 59.99%
  rare: 25,        // 25.00%
  epic: 13,        // 13.00%
  legendary: 2,    // 2.00%
  super: 0.01,     // 0.01% Secret Super Drop!
};

export const SKINS = [
  // Common (59.99% case roll)
  { id: 'default', label: 'WAREHOUSE CREW', description: 'The original Jared work jacket', rarity: 'common' as SkinRarity, cost: 0, color: '#ff0055', accent: '#ffd34d', animated: false, secret: false },
  { id: 'forklift_yellow', label: 'FORKLIFT GOLD', description: 'OSHA certified high-visibility hazard yellow', rarity: 'common' as SkinRarity, cost: 30, color: '#eab308', accent: '#fde047', animated: false, secret: false },
  { id: 'warehouse_gray', label: 'INVENTORY SLATE', description: 'Tactical depot uniform for silent shelf-stocking', rarity: 'common' as SkinRarity, cost: 30, color: '#64748b', accent: '#94a3b8', animated: false, secret: false },

  // Rare (25% case roll)
  { id: 'cuda_blue', label: 'CUDA BLUE', description: 'Cool blue build-team colors', rarity: 'rare' as SkinRarity, cost: 40, color: '#398dff', accent: '#79e5ff', animated: false, secret: false },
  { id: 'liquid_coolant', label: 'LIQUID COOLANT', description: 'Sub-zero liquid loop neon cyan piping', rarity: 'rare' as SkinRarity, cost: 60, color: '#06b6d4', accent: '#67e8f9', animated: false, secret: false },
  { id: 'thermal_copper', label: 'THERMAL COPPER', description: 'Direct-contact heatpipe orange aesthetic', rarity: 'rare' as SkinRarity, cost: 60, color: '#f97316', accent: '#fdba74', animated: false, secret: false },

  // Epic (13% case roll)
  { id: 'rgb_runner', label: 'RGB RUNNER', description: 'A bright builder with all the lights', rarity: 'epic' as SkinRarity, cost: 75, color: '#df55e8', accent: '#54e0c0', animated: false, secret: false },
  { id: 'shipping_gold', label: 'SHIPMENT GOLD', description: 'Reserved for the fastest packers', rarity: 'epic' as SkinRarity, cost: 120, color: '#e7a92b', accent: '#fff1a1', animated: false, secret: false },
  { id: 'night_shift', label: 'NIGHT SHIFT', description: 'Built for late orders and long runs', rarity: 'epic' as SkinRarity, cost: 180, color: '#5965b8', accent: '#a5b4ff', animated: false, secret: false },
  { id: 'amethyst_surge', label: 'AMETHYST SURGE', description: 'Supercharged crystalline violet overclock', rarity: 'epic' as SkinRarity, cost: 150, color: '#9333ea', accent: '#c084fc', animated: false, secret: false },

  // Legendary (2% case roll - Animated!)
  { id: 'quantum_holo', label: 'QUANTUM HOLO', description: 'Legendary 2% drop! Pulsing chromatic prismatic shift.', rarity: 'legendary' as SkinRarity, cost: 350, color: '#10b981', accent: '#ec4899', animated: true, secret: false },

  // SUPER SECRET (0.01% Case Roll - Mythic Animated!)
  { id: 'super_nova_prime', label: 'CHRONO SUPERNOVA', description: '★ SUPER SECRET (0.01% DROP)! Hyper-pulsing solar flare corona & temporal distortion.', rarity: 'super' as SkinRarity, cost: 0, color: '#ffe600', accent: '#ff0055', animated: true, secret: false },
  { id: 'singularity_void', label: 'VOID SINGULARITY', description: '★ SUPER SECRET (0.01% DROP)! Event horizon tearing the fabric of reality with dark matter waves.', rarity: 'super' as SkinRarity, cost: 0, color: '#7928ca', accent: '#00ffff', animated: true, secret: false },

  // Secret Runbun Exclusive
  { id: SECRET_SKIN_ID, label: '[REDACTED]', description: 'Black shirt. Red boxes. Nobody knows where it came from.', rarity: 'legendary' as SkinRarity, cost: 0, color: '#0a0a0a', accent: '#ff2a2a', animated: true, secret: true },
] as const;

export type SkinId = typeof SKINS[number]['id'];

export function rollSkinCase(): typeof SKINS[number] {
  // Fair exact percentages: 0.01% Super, 2% Legendary, 13% Epic, 25% Rare, 59.99% Common (100% total)
  const roll = Math.random() * 100;
  let targetRarity: SkinRarity;
  if (roll < 0.01) {
    targetRarity = 'super';
  } else if (roll < 0.01 + 2.0) { // 2.01
    targetRarity = 'legendary';
  } else if (roll < 0.01 + 2.0 + 13.0) { // 15.01
    targetRarity = 'epic';
  } else if (roll < 0.01 + 2.0 + 13.0 + 25.0) { // 40.01
    targetRarity = 'rare';
  } else {
    targetRarity = 'common';
  }

  // Pick uniformly from case-eligible skins of target rarity (excluding secret skins like [REDACTED])
  const candidates = SKINS.filter(s => s.rarity === targetRarity && !s.secret);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? SKINS[0];
}

// ── RANKS ─────────────────────────────────────────
// Normal-run ranks are earned from a player's best CUDA-core run.
// The global top 3 on the leaderboard hold three unique titles instead.
export const RANK_TIERS = [
  { id: 'bronze_1',  label: 'BRONZE I',   minCores: 0,      color: '#c8804a' },
  { id: 'bronze_2',  label: 'BRONZE II',  minCores: 150,    color: '#c8804a' },
  { id: 'bronze_3',  label: 'BRONZE III', minCores: 350,    color: '#c8804a' },
  { id: 'silver_1',  label: 'SILVER I',   minCores: 600,    color: '#c9d1dc' },
  { id: 'silver_2',  label: 'SILVER II',  minCores: 900,    color: '#c9d1dc' },
  { id: 'silver_3',  label: 'SILVER III', minCores: 1300,   color: '#c9d1dc' },
  { id: 'gold_1',    label: 'GOLD I',     minCores: 1800,   color: '#ffd34d' },
  { id: 'gold_2',    label: 'GOLD II',    minCores: 2500,   color: '#ffd34d' },
  { id: 'gold_3',    label: 'GOLD III',   minCores: 3500,   color: '#ffd34d' },
  { id: 'silicon',   label: 'SILICON',    minCores: 5000,   color: '#7bb7ff' },
  { id: 'diamond',   label: 'DIAMOND',    minCores: 8000,   color: '#8ff4ff' },
  { id: 'emerald',   label: 'EMERALD',    minCores: 12000,  color: '#3ee08a' },
] as const;

export const TOP_RANKS = [
  { position: 1, id: 'cool_jared',   label: 'COOL JARED',   color: '#ff2a8a' },
  { position: 2, id: 'cheat_master', label: 'CHEAT MASTER', color: '#c05cff' },
  { position: 3, id: 'jailbreaker',  label: 'JAILBREAKER',  color: '#ff7a1a' },
] as const;

export type RankInfo = {
  id: string;
  label: string;
  color: string;
  /** 1-based leaderboard position when this is a top-3 title, otherwise null */
  position: number | null;
  /** Cores required for the next tier, or null at the top */
  nextMinCores: number | null;
};

export function getRank(bestCores: number, leaderboardPosition: number | null): RankInfo {
  const top = TOP_RANKS.find(t => t.position === leaderboardPosition);
  if (top) return { id: top.id, label: top.label, color: top.color, position: top.position, nextMinCores: null };
  let idx = 0;
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (bestCores >= RANK_TIERS[i].minCores) idx = i;
  }
  const tier = RANK_TIERS[idx];
  const next = RANK_TIERS[idx + 1];
  return { id: tier.id, label: tier.label, color: tier.color, position: null, nextMinCores: next ? next.minCores : null };
}

export type PublicProfile = {
  id: number;
  username: string;
  joinedAt: string;
  bestCores: number;
  bestScore: number;
  bestDistance: number;
  leaderboardPosition: number | null;
  rank: RankInfo;
  achievements: string[];
  equippedSkin: string;
  ownedSkinCount: number;
  hardDriveTier: number;
  cpuTier: number;
};

export const HARD_DRIVE_TIERS = [
  { tier: 1, name: 'BASE',          color: '#aaaaaa', speedBonus: 0.08, cost: 25  },
  { tier: 2, name: 'GEM',           color: '#44ffaa', speedBonus: 0.16, cost: 50  },
  { tier: 3, name: 'METAL',         color: '#6688ff', speedBonus: 0.25, cost: 100 },
  { tier: 4, name: 'MAGIC',         color: '#dd44ff', speedBonus: 0.35, cost: 200 },
  { tier: 5, name: 'OPAL',          color: '#ffdd00', speedBonus: 0.50, cost: 400 },
  { tier: 6, name: "DRAGON'S BREATH", color: '#ff4400', speedBonus: 0.70, cost: 900 },
] as const;

export const HD_MAX_TIER = 6;

export const CPU_TIERS = [
  { tier: 1, name: 'BASE',            color: '#aaaaaa', coinsPerClaim: 2,  cost: 25  },
  { tier: 2, name: 'GEM',             color: '#44ffaa', coinsPerClaim: 5,  cost: 50  },
  { tier: 3, name: 'METAL',           color: '#6688ff', coinsPerClaim: 10, cost: 100 },
  { tier: 4, name: 'MAGIC',           color: '#dd44ff', coinsPerClaim: 18, cost: 200 },
  { tier: 5, name: 'OPAL',            color: '#ffdd00', coinsPerClaim: 30, cost: 400 },
  { tier: 6, name: "DRAGON'S BREATH", color: '#ff4400', coinsPerClaim: 50, cost: 900 },
] as const;

export const CPU_MAX_TIER = 6;
export const CPU_CLAIM_HOURS = 12;
export const CPU_MAX_STORED_CLAIMS = 5;
