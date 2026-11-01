import { db } from "./db";
import { sql } from "drizzle-orm";
import {
  highScores, users,
  type CreateHighScoreRequest, type HighScoreResponse, type UserProfile,
  SHOP_ITEMS, type ShopItemId, type LotusCheckpoint, HARD_DRIVE_TIERS, HD_MAX_TIER,
  SKINS, type SkinId, SECRET_SKIN_ID, getRank, type PublicProfile, type LeaderboardEntry,
  CPU_TIERS, CPU_MAX_TIER, CPU_CLAIM_HOURS, CPU_MAX_STORED_CLAIMS,
  CASE_COST, CASE_DUPLICATE_REFUND, rollSkinCase,
} from "@shared/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

export function hashPassword(password: string): string {
  return createHash("sha256").update(password + "wh2027_salt").digest("hex");
}

export interface IStorage {
  getHighScores(limit?: number): Promise<HighScoreResponse[]>;
  getAllHighScores(): Promise<HighScoreResponse[]>;
  createHighScore(score: CreateHighScoreRequest): Promise<HighScoreResponse>;
  upsertHighScore(score: CreateHighScoreRequest): Promise<HighScoreResponse>;
  deleteHighScore(id: number): Promise<void>;
  createUser(username: string, passwordHash: string): Promise<UserProfile>;
  getUserByUsername(username: string): Promise<(UserProfile & { passwordHash: string }) | null>;
  getUserById(id: number): Promise<UserProfile | null>;
  getAllUsers(): Promise<UserProfile[]>;
  awardCudaCoins(userId: number, coins: number): Promise<UserProfile>;
  adminSetField(userId: number, field: string, value: number): Promise<UserProfile>;
  adminDeleteUser(userId: number): Promise<void>;
  buyShopItem(userId: number, itemId: ShopItemId): Promise<{ success: boolean; message?: string; profile: UserProfile }>;
  buySkin(userId: number, skinId: SkinId): Promise<{ success: boolean; message?: string; profile: UserProfile }>;
  equipSkin(userId: number, skinId: SkinId): Promise<{ success: boolean; message?: string; profile: UserProfile }>;
  openSkinCase(userId: number): Promise<{ success: boolean; message?: string; skin?: typeof SKINS[number]; isNew?: boolean; refund?: number; profile?: UserProfile }>;
  recordRunAchievements(userId: number, stats: { distance: number; cudaCores: number; flopsCollected: number; rareCds: number; pcBuildFast: boolean }): Promise<UserProfile>;
  giftRunbun(userId: number): Promise<{ success: boolean; message?: string; firstGift: boolean; profile: UserProfile }>;
  getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  getPublicProfile(userId: number): Promise<PublicProfile | null>;
  placeLotus(userId: number, checkpoint: LotusCheckpoint): Promise<{ success: boolean; message?: string; profile: UserProfile }>;
  consumeLotusCheckpoint(userId: number): Promise<{ success: boolean; message?: string; profile: UserProfile }>;
  consumeItem(userId: number, field: 'revives' | 'headStarts' | 'luckyCharms' | 'overclocks' | 'sprintBoosts' | 'coreDoublers' | 'ghostBoosts'): Promise<UserProfile | null>;
  upgradeHardDrive(userId: number): Promise<{ success: boolean; message?: string; profile: UserProfile }>;
  upgradeCpu(userId: number): Promise<{ success: boolean; message?: string; profile: UserProfile }>;
  claimCpuCoins(userId: number): Promise<{ success: boolean; message?: string; coins?: number; profile: UserProfile }>;
  redeemCode(userId: number, code: string): Promise<{ success: boolean; message?: string; profile: UserProfile }>;
  setUserRole(userId: number, role: string): Promise<UserProfile>;
  adminChangeUsername(userId: number, newUsername: string): Promise<UserProfile>;
  adminUnlockAllSkins(userId: number): Promise<UserProfile>;
  adminMaxMasteries(userId: number): Promise<UserProfile>;
}

const RARE_CD_MIN_DISTANCE = 400;
const RARE_CD_COOLDOWN_MS = 60_000;
const rareCdCreditedAt = new Map<number, number>();

export class DatabaseStorage implements IStorage {
  private checkDb() {
    if (!db) throw new Error("Database not initialized. Ensure DATABASE_URL is set.");
  }
  async getAllHighScores(): Promise<HighScoreResponse[]> {
    this.checkDb();
    return db.select().from(highScores).orderBy(desc(highScores.cudaCoresCollected));
  }
  async deleteHighScore(id: number): Promise<void> {
    this.checkDb();
    await db.delete(highScores).where(eq(highScores.id, id));
  }
  async getAllUsers(): Promise<UserProfile[]> {
    this.checkDb();
    const all = await db.select().from(users).orderBy(users.id);
    return all.map(u => this._toProfile(u));
  }
  async setUserRole(userId: number, role: string): Promise<UserProfile> {
    this.checkDb();
    const [updated] = await db.update(users).set({ role }).where(eq(users.id, userId)).returning();
    return this._toProfile(updated);
  }
  async adminSetField(userId: number, field: string, value: number): Promise<UserProfile> {
    this.checkDb();
    const allowed = ['cudaCoins', 'revives', 'headStarts', 'luckyCharms', 'overclocks',
                     'hardDriveTier', 'cpuTier', 'sprintBoosts', 'coreDoublers', 'ghostBoosts', 'lotuses', 'rareCds'];
    if (!allowed.includes(field)) throw new Error('Field not allowed');
    const updateData: Record<string, any> = {};
    updateData[field] = value;
    const [updated] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
    return this._toProfile(updated);
  }
  async adminDeleteUser(userId: number): Promise<void> {
    this.checkDb();
    await db.delete(highScores).where(eq(highScores.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
  async adminChangeUsername(userId: number, newUsername: string): Promise<UserProfile> {
    this.checkDb();
    const uname = newUsername.trim().toUpperCase();
    const [updated] = await db.update(users).set({ username: uname }).where(eq(users.id, userId)).returning();
    return this._toProfile(updated);
  }
  async adminUnlockAllSkins(userId: number): Promise<UserProfile> {
    this.checkDb();
    const allSkinIds = SKINS.map(s => s.id);
    const [updated] = await db.update(users).set({ ownedSkins: JSON.stringify(allSkinIds) as any }).where(eq(users.id, userId)).returning();
    return this._toProfile(updated);
  }
  async adminMaxMasteries(userId: number): Promise<UserProfile> {
    this.checkDb();
    const [updated] = await db.update(users).set({ hardDriveTier: 6, cpuTier: 6 }).where(eq(users.id, userId)).returning();
    return this._toProfile(updated);
  }
  async getHighScores(limit: number = 10): Promise<HighScoreResponse[]> {
    this.checkDb();
    const all = await db.select().from(highScores).orderBy(desc(highScores.cudaCoresCollected));
    const seenUser = new Map<number, HighScoreResponse>();
    const seenName = new Map<string, HighScoreResponse>();
    const result: HighScoreResponse[] = [];
    for (const row of all) {
      if (row.userId) {
        if (!seenUser.has(row.userId)) { seenUser.set(row.userId, row); result.push(row); }
      } else {
        const key = row.playerName.toUpperCase();
        if (!seenName.has(key)) { seenName.set(key, row); result.push(row); }
      }
    }
    return result.slice(0, limit);
  }
  async createHighScore(score: CreateHighScoreRequest): Promise<HighScoreResponse> {
    this.checkDb();
    const [newScore] = await db.insert(highScores).values(score).returning();
    return newScore;
  }
  async upsertHighScore(score: CreateHighScoreRequest): Promise<HighScoreResponse> {
    this.checkDb();
    if (score.userId) {
      const existing = await db.select().from(highScores).where(eq(highScores.userId, score.userId)).limit(1);
      if (existing.length > 0) {
        if (score.cudaCoresCollected > existing[0].cudaCoresCollected) {
          const [updated] = await db.update(highScores)
            .set({ score: score.score, cudaCoresCollected: score.cudaCoresCollected, distance: score.distance })
            .where(eq(highScores.id, existing[0].id)).returning();
          return updated;
        }
        return existing[0];
      }
    }
    const [newScore] = await db.insert(highScores).values({ ...score, playerName: score.playerName.toUpperCase() }).returning();
    return newScore;
  }
  async createUser(username: string, passwordHash: string): Promise<UserProfile> {
    this.checkDb();
    const [user] = await db.insert(users).values({ username: username.toUpperCase(), passwordHash }).returning();
    return this._toProfile(user);
  }
  async getUserByUsername(username: string): Promise<(UserProfile & { passwordHash: string }) | null> {
    this.checkDb();
    const [user] = await db.select().from(users).where(eq(users.username, username.toUpperCase())).limit(1);
    if (!user) return null;
    return { ...this._toProfile(user), passwordHash: user.passwordHash };
  }
  async getUserById(id: number): Promise<UserProfile | null> {
    this.checkDb();
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) return null;
    return this._toProfile(user);
  }
  async awardCudaCoins(userId: number, coins: number): Promise<UserProfile> {
    this.checkDb();
    const [updated] = await db.update(users)
      .set({ cudaCoins: sql`${users.cudaCoins} + ${coins}` })
      .where(eq(users.id, userId)).returning();
    return this._toProfile(updated);
  }
  async consumeItem(userId: number, field: 'revives' | 'headStarts' | 'luckyCharms' | 'overclocks' | 'sprintBoosts' | 'coreDoublers' | 'ghostBoosts'): Promise<UserProfile | null> {
    this.checkDb();
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u || u[field] <= 0) return null;
    const updateData: Record<string, any> = {};
    updateData[field] = u[field] - 1;
    const [updated] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
    return this._toProfile(updated);
  }
  async buyShopItem(userId: number, itemId: ShopItemId): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    this.checkDb();
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    const uProfile = await this.getUserById(userId);
    if (!uProfile) return { success: false, message: "User not found", profile: null as any };
    if (!item) return { success: false, message: "Unknown item", profile: uProfile };
    if (uProfile.cudaCoins < item.cost) return { success: false, message: "Not enough CUDA coins", profile: uProfile };
    const currentQty = uProfile[item.field as keyof UserProfile] as number;
    if (currentQty >= item.max) return { success: false, message: `Max ${item.max} already owned`, profile: uProfile };
    const achievements = uProfile.achievements;
    if (!achievements.includes('big_spender')) achievements.push('big_spender');
    const updateData: Record<string, any> = {
      cudaCoins: uProfile.cudaCoins - item.cost,
      achievements: JSON.stringify(achievements),
    };
    updateData[item.field] = currentQty + 1;
    const [updated] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
    return { success: true, profile: this._toProfile(updated) };
  }
  async buySkin(userId: number, skinId: SkinId): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    this.checkDb();
    const skin = SKINS.find(s => s.id === skinId);
    const current = await this.getUserById(userId);
    if (!skin || !current) return { success: false, message: "Unknown skin", profile: current as any };
    if (skin.secret) return { success: false, message: "This skin cannot be bought", profile: current };
    if (current.ownedSkins.includes(skinId)) {
      return { success: false, message: "Skin already owned", profile: current };
    }
    if (current.cudaCoins < skin.cost) {
      return { success: false, message: "Not enough CUDA coins", profile: current };
    }
    const ownedSkins = [...current.ownedSkins, skinId];
    const achievements = current.achievements.includes('big_spender')
      ? current.achievements
      : [...current.achievements, 'big_spender'];
    const [updated] = await db.update(users).set({
      cudaCoins: current.cudaCoins - skin.cost,
      ownedSkins: JSON.stringify(ownedSkins),
      achievements: JSON.stringify(achievements),
    }).where(eq(users.id, userId)).returning();
    return { success: true, profile: this._toProfile(updated) };
  }
  async equipSkin(userId: number, skinId: SkinId): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    this.checkDb();
    const current = await this.getUserById(userId);
    if (!current) return { success: false, message: "User not found", profile: null as any };
    if (!SKINS.some(s => s.id === skinId)) {
      return { success: false, message: "Unknown skin", profile: this._toProfile(current) };
    }
    if (!current.ownedSkins.includes(skinId)) {
      return { success: false, message: "Purchase this skin first", profile: this._toProfile(current) };
    }
    const [updated] = await db.update(users)
      .set({ equippedSkin: skinId })
      .where(eq(users.id, userId)).returning();
    return { success: true, profile: this._toProfile(updated) };
  }
  async openSkinCase(userId: number): Promise<{ success: boolean; message?: string; skin?: typeof SKINS[number]; isNew?: boolean; refund?: number; profile?: UserProfile }> {
    this.checkDb();
    const current = await this.getUserById(userId);
    if (!current) return { success: false, message: "User not found" };
    if (current.cudaCoins < CASE_COST) {
      return { success: false, message: `Need ${CASE_COST} CUDA coins to open a case`, profile: current };
    }
    const skin = rollSkinCase();
    const alreadyOwned = current.ownedSkins.includes(skin.id);
    const refund = alreadyOwned ? CASE_DUPLICATE_REFUND : 0;
    const netCost = CASE_COST - refund;
    const ownedSkins = alreadyOwned ? current.ownedSkins : [...current.ownedSkins, skin.id];
    const achievements = current.achievements.includes('big_spender')
      ? current.achievements
      : [...current.achievements, 'big_spender'];
    const [updated] = await db.update(users).set({
      cudaCoins: current.cudaCoins - netCost,
      ownedSkins: JSON.stringify(ownedSkins),
      achievements: JSON.stringify(achievements),
    }).where(eq(users.id, userId)).returning();
    return {
      success: true,
      skin,
      isNew: !alreadyOwned,
      refund,
      profile: this._toProfile(updated),
    };
  }
  async recordRunAchievements(userId: number, stats: { distance: number; cudaCores: number; flopsCollected: number; rareCds: number; pcBuildFast: boolean }): Promise<UserProfile> {
    this.checkDb();
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw new Error("User not found");
    const wantsCd = Math.floor(stats.rareCds || 0) > 0;
    const runLongEnough = stats.distance >= RARE_CD_MIN_DISTANCE;
    const lastCd = rareCdCreditedAt.get(userId) ?? 0;
    const offCooldown = Date.now() - lastCd >= RARE_CD_COOLDOWN_MS;
    const cdGain = wantsCd && runLongEnough && offCooldown ? 1 : 0;
    if (cdGain > 0) rareCdCreditedAt.set(userId, Date.now());
    const unlocked = this._parseArray(u.achievements);
    const earned: string[] = [];
    if (!unlocked.includes('first_dash')) earned.push('first_dash');
    if (stats.cudaCores >= 1_000 && !unlocked.includes('core_1000')) earned.push('core_1000');
    if (stats.cudaCores >= 10_000 && !unlocked.includes('core_10000')) earned.push('core_10000');
    if (stats.distance >= 1_000 && !unlocked.includes('distance_1000')) earned.push('distance_1000');
    if (stats.distance >= 5_000 && !unlocked.includes('distance_5000')) earned.push('distance_5000');
    if (stats.flopsCollected >= 10 && !unlocked.includes('flops_10')) earned.push('flops_10');
    if (stats.pcBuildFast && !unlocked.includes('star_employee')) earned.push('star_employee');
    if (earned.length === 0 && cdGain === 0) return this._toProfile(u);
    const [updated] = await db.update(users)
      .set({
        achievements: JSON.stringify([...unlocked, ...earned]),
        rareCds: u.rareCds + cdGain,
      })
      .where(eq(users.id, userId)).returning();
    return this._toProfile(updated);
  }
  async giftRunbun(userId: number): Promise<{ success: boolean; message?: string; firstGift: boolean; profile: UserProfile }> {
    this.checkDb();
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return { success: false, message: "User not found", firstGift: false, profile: null as any };
    if (u.rareCds <= 0) return { success: false, message: "You need a rare CD to give Runbun", firstGift: false, profile: this._toProfile(u) };
    const achievements = this._parseArray(u.achievements);
    const ownedSkins = this._parseArray(u.ownedSkins);
    const firstGift = !achievements.includes('redacted');
    if (firstGift) achievements.push('redacted');
    if (!ownedSkins.includes(SECRET_SKIN_ID)) ownedSkins.push(SECRET_SKIN_ID);
    const [updated] = await db.update(users)
      .set({
        rareCds: u.rareCds - 1,
        runbunGifted: u.runbunGifted + 1,
        achievements: JSON.stringify(achievements),
        ownedSkins: JSON.stringify(ownedSkins),
      })
      .where(eq(users.id, userId)).returning();
    return { success: true, firstGift, profile: this._toProfile(updated) };
  }
  async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
    this.checkDb();
    const rows = await this.getHighScores(limit);
    return rows.map((row, idx) => ({ ...row, rank: getRank(row.cudaCoresCollected, idx + 1) }));
  }
  async getPublicProfile(userId: number): Promise<PublicProfile | null> {
    this.checkDb();
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return null;
    const [best] = await db.select().from(highScores).where(eq(highScores.userId, userId)).limit(1);
    const bestCores = best?.cudaCoresCollected ?? 0;
    const board = await this.getHighScores(1000);
    const idx = board.findIndex(row => row.userId === userId);
    const position = idx >= 0 ? idx + 1 : null;
    const ownedSkins = this._parseArray(u.ownedSkins);
    return {
      id: u.id,
      username: u.username,
      joinedAt: u.createdAt.toISOString(),
      bestCores,
      bestScore: best?.score ?? 0,
      bestDistance: best?.distance ?? 0,
      leaderboardPosition: position,
      rank: getRank(bestCores, position),
      achievements: this._parseArray(u.achievements),
      equippedSkin: u.equippedSkin || 'default',
      ownedSkinCount: Math.max(1, ownedSkins.length),
      hardDriveTier: u.hardDriveTier,
      cpuTier: u.cpuTier,
    };
  }
  async placeLotus(userId: number, checkpoint: LotusCheckpoint): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    this.checkDb();
    const current = await this.getUserById(userId);
    const [updated] = await db.update(users)
      .set({
        lotuses: sql`${users.lotuses} - 1`,
        lotusCheckpoint: JSON.stringify(checkpoint),
        achievements: JSON.stringify(
          current && !current.achievements.includes('lotus_keeper')
            ? [...current.achievements, 'lotus_keeper']
            : current?.achievements ?? [],
        ),
      })
      .where(sql`${users.id} = ${userId} AND ${users.lotuses} > 0 AND ${users.lotusCheckpoint} IS NULL`)
      .returning();
    if (updated) return { success: true, profile: this._toProfile(updated) };
    const profile = await this.getUserById(userId);
    if (!profile) return { success: false, message: "User not found", profile: null as any };
    return {
      success: false,
      message: profile.lotuses <= 0 ? "Buy a Lotus before planting one" : "A Lotus is already planted",
      profile,
    };
  }
  async consumeLotusCheckpoint(userId: number): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    this.checkDb();
    const [updated] = await db.update(users)
      .set({ lotusCheckpoint: null })
      .where(sql`${users.id} = ${userId} AND ${users.lotusCheckpoint} IS NOT NULL`)
      .returning();
    if (updated) return { success: true, profile: this._toProfile(updated) };
    const profile = await this.getUserById(userId);
    return { success: false, message: "No planted Lotus checkpoint found", profile: profile ?? null as any };
  }
  async upgradeHardDrive(userId: number): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    this.checkDb();
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    if (u.hardDriveTier >= HD_MAX_TIER) return { success: false, message: "Already at max tier", profile: this._toProfile(u) };
    const nextTier = HARD_DRIVE_TIERS.find(t => t.tier === u.hardDriveTier + 1);
    if (!nextTier) return { success: false, message: "Invalid tier", profile: this._toProfile(u) };
    if (u.cudaCoins < nextTier.cost) return { success: false, message: `Need ${nextTier.cost} CUDA coins`, profile: this._toProfile(u) };
    const [updated] = await db.update(users)
      .set({ cudaCoins: u.cudaCoins - nextTier.cost, hardDriveTier: u.hardDriveTier + 1 })
      .where(eq(users.id, userId)).returning();
    return { success: true, profile: this._toProfile(updated) };
  }
  async upgradeCpu(userId: number): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    this.checkDb();
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    if (u.cpuTier >= CPU_MAX_TIER) return { success: false, message: "Already at max tier", profile: this._toProfile(u) };
    const nextTier = CPU_TIERS.find(t => t.tier === u.cpuTier + 1);
    if (!nextTier) return { success: false, message: "Invalid tier", profile: this._toProfile(u) };
    if (u.cudaCoins < nextTier.cost) return { success: false, message: `Need ${nextTier.cost} CUDA coins`, profile: this._toProfile(u) };
    const [updated] = await db.update(users)
      .set({ cudaCoins: u.cudaCoins - nextTier.cost, cpuTier: u.cpuTier + 1 })
      .where(eq(users.id, userId)).returning();
    return { success: true, profile: this._toProfile(updated) };
  }
  async claimCpuCoins(userId: number): Promise<{ success: boolean; message?: string; coins?: number; profile: UserProfile }> {
    this.checkDb();
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    if (u.cpuTier <= 0) return { success: false, message: "No CPU unlocked", profile: this._toProfile(u) };
    const tier = CPU_TIERS.find(t => t.tier === u.cpuTier)!;
    const now = new Date();
    const lastClaimed = u.cpuLastClaimedAt ? new Date(u.cpuLastClaimedAt) : null;
    const CLAIM_MS = CPU_CLAIM_HOURS * 60 * 60 * 1000;
    if (lastClaimed && now.getTime() - lastClaimed.getTime() < CLAIM_MS) {
      const nextClaimIn = Math.ceil((CLAIM_MS - (now.getTime() - lastClaimed.getTime())) / (60 * 60 * 1000));
      return { success: false, message: `Next claim in ${nextClaimIn}h`, profile: this._toProfile(u) };
    }
    const hoursElapsed = lastClaimed ? (now.getTime() - lastClaimed.getTime()) / (60 * 60 * 1000) : CPU_CLAIM_HOURS;
    const periodsEarned = Math.min(Math.floor(hoursElapsed / CPU_CLAIM_HOURS), CPU_MAX_STORED_CLAIMS);
    const coinsEarned = tier.coinsPerClaim * periodsEarned;
    const [updated] = await db.update(users)
      .set({ cudaCoins: u.cudaCoins + coinsEarned, cpuLastClaimedAt: now })
      .where(eq(users.id, userId)).returning();
    return { success: true, coins: coinsEarned, profile: this._toProfile(updated) };
  }
  async redeemCode(userId: number, code: string): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    this.checkDb();
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    const normalized = code.trim().toLowerCase().replace(/\s+/g, ' ');
    const now = new Date();
    if (normalized === "supersecret") {
      if (u.superSecretRedeemedAt) {
        return { success: false, message: "SUPERSECRET has already been redeemed", profile: this._toProfile(u) };
      }
      const [updated] = await db.update(users)
        .set({ rareCds: sql`${users.rareCds} + 1`, superSecretRedeemedAt: now })
        .where(and(eq(users.id, userId), isNull(users.superSecretRedeemedAt)))
        .returning();
      if (!updated) {
        return { success: false, message: "SUPERSECRET has already been redeemed", profile: this._toProfile(u) };
      }
      return { success: true, profile: this._toProfile(updated) };
    }
    if (normalized === "happy dog") {
      const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
      const last = u.lastCodeRedeemedAt ? new Date(u.lastCodeRedeemedAt) : null;
      if (last && now.getTime() - last.getTime() < TWO_DAYS_MS) {
        const h = Math.ceil((TWO_DAYS_MS - (now.getTime() - last.getTime())) / (60 * 60 * 1000));
        return { success: false, message: `Wait ${h} more hours to redeem again`, profile: this._toProfile(u) };
      }
      const [updated] = await db.update(users).set({ cudaCoins: u.cudaCoins + 400, lastCodeRedeemedAt: now }).where(eq(users.id, userId)).returning();
      return { success: true, profile: this._toProfile(updated) };
    }
    if (normalized === "free revive") {
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const last = u.lastFreeReviveAt ? new Date(u.lastFreeReviveAt) : null;
      if (last && now.getTime() - last.getTime() < ONE_DAY_MS) {
        const h = Math.ceil((ONE_DAY_MS - (now.getTime() - last.getTime())) / (60 * 60 * 1000));
        return { success: false, message: `Come back in ${h}h for your next revive`, profile: this._toProfile(u) };
      }
      const [updated] = await db.update(users)
        .set({ revives: u.revives + 1, lastFreeReviveAt: now })
        .where(eq(users.id, userId)).returning();
      return { success: true, profile: this._toProfile(updated) };
    }
    if (normalized === "remastered") {
      const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
      const last = u.lastRemasteredAt ? new Date(u.lastRemasteredAt) : null;
      if (last && now.getTime() - last.getTime() < TWO_WEEKS_MS) {
        const days = Math.ceil((TWO_WEEKS_MS - (now.getTime() - last.getTime())) / (24 * 60 * 60 * 1000));
        return { success: false, message: `Remastered resets in ${days} days`, profile: this._toProfile(u) };
      }
      let updateData: Record<string, any> = { lastRemasteredAt: now };
      if (u.hardDriveTier < HD_MAX_TIER) {
        updateData.hardDriveTier = u.hardDriveTier + 1;
      } else if (u.cpuTier < CPU_MAX_TIER) {
        updateData.cpuTier = u.cpuTier + 1;
      } else {
        updateData.cudaCoins = u.cudaCoins + 80;
      }
      const [updated] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
      return { success: true, profile: this._toProfile(updated) };
    }
    return { success: false, message: "Invalid code", profile: this._toProfile(u) };
  }
  private _parseArray(value: string | null | undefined): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  private _toProfile(u: typeof users.$inferSelect): UserProfile {
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      cudaCoins: u.cudaCoins,
      revives: u.revives,
      headStarts: u.headStarts,
      luckyCharms: u.luckyCharms,
      overclocks: u.overclocks,
      hardDriveTier: u.hardDriveTier,
      cpuTier: u.cpuTier,
      sprintBoosts: u.sprintBoosts,
      coreDoublers: u.coreDoublers,
      ghostBoosts: u.ghostBoosts,
      lotuses: u.lotuses,
      achievements: this._parseArray(u.achievements),
      ownedSkins: this._parseArray(u.ownedSkins).length > 0 ? this._parseArray(u.ownedSkins) : ['default'],
      equippedSkin: u.equippedSkin || 'default',
      rareCds: u.rareCds,
      runbunGifted: u.runbunGifted,
      lotusCheckpoint: (() => {
        if (!u.lotusCheckpoint) return null;
        try {
          return JSON.parse(u.lotusCheckpoint) as LotusCheckpoint;
        } catch {
          return null;
        }
      })(),
      lastCodeRedeemedAt: u.lastCodeRedeemedAt?.toISOString() ?? null,
      lastFreeReviveAt: u.lastFreeReviveAt?.toISOString() ?? null,
      lastRemasteredAt: u.lastRemasteredAt?.toISOString() ?? null,
      cpuLastClaimedAt: u.cpuLastClaimedAt?.toISOString() ?? null,
    };
  }
}

type StoredUser = {
  id: number;
  username: string;
  passwordHash: string;
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
  lotusCheckpoint: string | null;
  achievements: string;
  ownedSkins: string;
  equippedSkin: string;
  rareCds: number;
  runbunGifted: number;
  superSecretRedeemedAt: string | null;
  lastCodeRedeemedAt: string | null;
  lastFreeReviveAt: string | null;
  lastRemasteredAt: string | null;
  cpuLastClaimedAt: string | null;
  createdAt: string;
};

type StoredHighScore = {
  id: number;
  playerName: string;
  userId: number | null;
  password: string | null;
  score: number;
  cudaCoresCollected: number;
  distance: number;
  createdAt: string;
};

interface StorageFileSchema {
  users: StoredUser[];
  highScores: StoredHighScore[];
  nextUserId: number;
  nextScoreId: number;
}

export class FileStorage implements IStorage {
  private filePath: string;
  private data: StorageFileSchema;

  constructor() {
    this.filePath = path.resolve(process.cwd(), "data", "warehouse-storage.json");
    this.data = this._loadData();
  }

  private _loadData(): StorageFileSchema {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn("Failed to load storage from disk, creating fresh store:", e);
    }
    const defaultData: StorageFileSchema = {
      users: [],
      highScores: [
        {
          id: 1,
          playerName: "COOL_JARED",
          userId: null,
          password: null,
          score: 125000,
          cudaCoresCollected: 12500,
          distance: 8200,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          playerName: "RUNBUN_DEV",
          userId: null,
          password: null,
          score: 94000,
          cudaCoresCollected: 9400,
          distance: 6100,
          createdAt: new Date().toISOString(),
        },
        {
          id: 3,
          playerName: "WAREHOUSE_BOB",
          userId: null,
          password: null,
          score: 42000,
          cudaCoresCollected: 4200,
          distance: 3500,
          createdAt: new Date().toISOString(),
        },
      ],
      nextUserId: 1,
      nextScoreId: 4,
    };
    this._saveData(defaultData);
    return defaultData;
  }

  private _saveData(data = this.data) {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Error saving storage to file:", err);
    }
  }

  private _parseArray(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  private _toProfile(u: StoredUser): UserProfile {
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      cudaCoins: u.cudaCoins,
      revives: u.revives,
      headStarts: u.headStarts,
      luckyCharms: u.luckyCharms,
      overclocks: u.overclocks,
      hardDriveTier: u.hardDriveTier,
      cpuTier: u.cpuTier,
      sprintBoosts: u.sprintBoosts,
      coreDoublers: u.coreDoublers,
      ghostBoosts: u.ghostBoosts,
      lotuses: u.lotuses,
      achievements: this._parseArray(u.achievements),
      ownedSkins: this._parseArray(u.ownedSkins).length > 0 ? this._parseArray(u.ownedSkins) : ['default'],
      equippedSkin: u.equippedSkin || 'default',
      rareCds: u.rareCds,
      runbunGifted: u.runbunGifted,
      lotusCheckpoint: (() => {
        if (!u.lotusCheckpoint) return null;
        try {
          return JSON.parse(u.lotusCheckpoint) as LotusCheckpoint;
        } catch {
          return null;
        }
      })(),
      lastCodeRedeemedAt: u.lastCodeRedeemedAt ?? null,
      lastFreeReviveAt: u.lastFreeReviveAt ?? null,
      lastRemasteredAt: u.lastRemasteredAt ?? null,
      cpuLastClaimedAt: u.cpuLastClaimedAt ?? null,
    };
  }

  async getAllHighScores(): Promise<HighScoreResponse[]> {
    return [...this.data.highScores].sort((a, b) => b.cudaCoresCollected - a.cudaCoresCollected) as any;
  }

  async deleteHighScore(id: number): Promise<void> {
    this.data.highScores = this.data.highScores.filter(s => s.id !== id);
    this._saveData();
  }

  async getAllUsers(): Promise<UserProfile[]> {
    return this.data.users.map(u => this._toProfile(u));
  }

  async setUserRole(userId: number, role: string): Promise<UserProfile> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) throw new Error("User not found");
    u.role = role;
    this._saveData();
    return this._toProfile(u);
  }

  async adminSetField(userId: number, field: string, value: number): Promise<UserProfile> {
    const allowed = ['cudaCoins', 'revives', 'headStarts', 'luckyCharms', 'overclocks',
                     'hardDriveTier', 'cpuTier', 'sprintBoosts', 'coreDoublers', 'ghostBoosts', 'lotuses', 'rareCds'];
    if (!allowed.includes(field)) throw new Error('Field not allowed');
    const u = this.data.users.find(user => user.id === userId);
    if (!u) throw new Error("User not found");
    (u as any)[field] = value;
    this._saveData();
    return this._toProfile(u);
  }

  async adminDeleteUser(userId: number): Promise<void> {
    this.data.highScores = this.data.highScores.filter(s => s.userId !== userId);
    this.data.users = this.data.users.filter(u => u.id !== userId);
    this._saveData();
  }

  async adminChangeUsername(userId: number, newUsername: string): Promise<UserProfile> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) throw new Error("User not found");
    const uname = newUsername.trim().toUpperCase();
    const existing = this.data.users.find(user => user.id !== userId && user.username === uname);
    if (existing) throw new Error("Username already taken");
    u.username = uname;
    this.data.highScores.forEach(s => {
      if (s.userId === userId) s.playerName = uname;
    });
    this._saveData();
    return this._toProfile(u);
  }

  async adminUnlockAllSkins(userId: number): Promise<UserProfile> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) throw new Error("User not found");
    u.ownedSkins = JSON.stringify(SKINS.map(s => s.id));
    this._saveData();
    return this._toProfile(u);
  }

  async adminMaxMasteries(userId: number): Promise<UserProfile> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) throw new Error("User not found");
    u.hardDriveTier = 6;
    u.cpuTier = 6;
    this._saveData();
    return this._toProfile(u);
  }

  async getHighScores(limit: number = 10): Promise<HighScoreResponse[]> {
    const all = [...this.data.highScores].sort((a, b) => b.cudaCoresCollected - a.cudaCoresCollected);
    const seenUser = new Map<number, StoredHighScore>();
    const seenName = new Map<string, StoredHighScore>();
    const result: StoredHighScore[] = [];

    for (const row of all) {
      if (row.userId) {
        if (!seenUser.has(row.userId)) {
          seenUser.set(row.userId, row);
          result.push(row);
        }
      } else {
        const key = row.playerName.toUpperCase();
        if (!seenName.has(key)) {
          seenName.set(key, row);
          result.push(row);
        }
      }
    }
    return result.slice(0, limit) as any;
  }

  async createHighScore(score: CreateHighScoreRequest): Promise<HighScoreResponse> {
    const row: StoredHighScore = {
      id: this.data.nextScoreId++,
      playerName: score.playerName.toUpperCase(),
      userId: score.userId ?? null,
      password: score.password ?? null,
      score: score.score,
      cudaCoresCollected: score.cudaCoresCollected,
      distance: score.distance,
      createdAt: new Date().toISOString(),
    };
    this.data.highScores.push(row);
    this._saveData();
    return row as any;
  }

  async upsertHighScore(score: CreateHighScoreRequest): Promise<HighScoreResponse> {
    if (score.userId) {
      const existing = this.data.highScores.find(s => s.userId === score.userId);
      if (existing) {
        if (score.cudaCoresCollected > existing.cudaCoresCollected) {
          existing.score = score.score;
          existing.cudaCoresCollected = score.cudaCoresCollected;
          existing.distance = score.distance;
          this._saveData();
        }
        return existing as any;
      }
    }
    return this.createHighScore(score);
  }

  async createUser(username: string, passwordHash: string): Promise<UserProfile> {
    const u: StoredUser = {
      id: this.data.nextUserId++,
      username: username.toUpperCase(),
      passwordHash,
      role: "user",
      cudaCoins: 0,
      revives: 0,
      headStarts: 0,
      luckyCharms: 0,
      overclocks: 0,
      hardDriveTier: 0,
      cpuTier: 0,
      sprintBoosts: 0,
      coreDoublers: 0,
      ghostBoosts: 0,
      lotuses: 0,
      lotusCheckpoint: null,
      achievements: JSON.stringify([]),
      ownedSkins: JSON.stringify(["default"]),
      equippedSkin: "default",
      rareCds: 0,
      runbunGifted: 0,
      superSecretRedeemedAt: null,
      lastCodeRedeemedAt: null,
      lastFreeReviveAt: null,
      lastRemasteredAt: null,
      cpuLastClaimedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.data.users.push(u);
    this._saveData();
    return this._toProfile(u);
  }

  async getUserByUsername(username: string): Promise<(UserProfile & { passwordHash: string }) | null> {
    const u = this.data.users.find(user => user.username.toUpperCase() === username.toUpperCase());
    if (!u) return null;
    return { ...this._toProfile(u), passwordHash: u.passwordHash };
  }

  async getUserById(id: number): Promise<UserProfile | null> {
    const u = this.data.users.find(user => user.id === id);
    if (!u) return null;
    return this._toProfile(u);
  }

  async awardCudaCoins(userId: number, coins: number): Promise<UserProfile> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) throw new Error("User not found");
    u.cudaCoins += coins;
    this._saveData();
    return this._toProfile(u);
  }

  async consumeItem(
    userId: number,
    field: 'revives' | 'headStarts' | 'luckyCharms' | 'overclocks' | 'sprintBoosts' | 'coreDoublers' | 'ghostBoosts'
  ): Promise<UserProfile | null> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u || (u[field] as number) <= 0) return null;
    (u as any)[field] = (u[field] as number) - 1;
    this._saveData();
    return this._toProfile(u);
  }

  async buyShopItem(userId: number, itemId: ShopItemId): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    if (!item) return { success: false, message: "Unknown item", profile: this._toProfile(u) };
    if (u.cudaCoins < item.cost) return { success: false, message: "Not enough CUDA coins", profile: this._toProfile(u) };

    const currentQty = (u as any)[item.field] as number;
    if (currentQty >= item.max) return { success: false, message: `Max ${item.max} already owned`, profile: this._toProfile(u) };

    const achievements = this._parseArray(u.achievements);
    if (!achievements.includes('big_spender')) achievements.push('big_spender');

    u.cudaCoins -= item.cost;
    (u as any)[item.field] = currentQty + 1;
    u.achievements = JSON.stringify(achievements);
    this._saveData();
    return { success: true, profile: this._toProfile(u) };
  }

  async buySkin(userId: number, skinId: SkinId): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    const skin = SKINS.find(s => s.id === skinId);
    const u = this.data.users.find(user => user.id === userId);
    if (!skin || !u) return { success: false, message: "Unknown skin or user", profile: u ? this._toProfile(u) : null as any };
    if (skin.secret) return { success: false, message: "This skin cannot be bought", profile: this._toProfile(u) };

    const owned = this._parseArray(u.ownedSkins);
    if (owned.includes(skinId)) return { success: false, message: "Skin already owned", profile: this._toProfile(u) };
    if (u.cudaCoins < skin.cost) return { success: false, message: "Not enough CUDA coins", profile: this._toProfile(u) };

    owned.push(skinId);
    const achievements = this._parseArray(u.achievements);
    if (!achievements.includes('big_spender')) achievements.push('big_spender');

    u.cudaCoins -= skin.cost;
    u.ownedSkins = JSON.stringify(owned);
    u.achievements = JSON.stringify(achievements);
    this._saveData();
    return { success: true, profile: this._toProfile(u) };
  }

  async equipSkin(userId: number, skinId: SkinId): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    if (!SKINS.some(s => s.id === skinId)) return { success: false, message: "Unknown skin", profile: this._toProfile(u) };

    const owned = this._parseArray(u.ownedSkins);
    if (!owned.includes(skinId)) return { success: false, message: "Purchase this skin first", profile: this._toProfile(u) };

    u.equippedSkin = skinId;
    this._saveData();
    return { success: true, profile: this._toProfile(u) };
  }

  async openSkinCase(userId: number): Promise<{ success: boolean; message?: string; skin?: typeof SKINS[number]; isNew?: boolean; refund?: number; profile?: UserProfile }> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return { success: false, message: "User not found" };
    if (u.cudaCoins < CASE_COST) {
      return { success: false, message: `Need ${CASE_COST} CUDA coins to open a case`, profile: this._toProfile(u) };
    }
    const skin = rollSkinCase();
    const owned = this._parseArray(u.ownedSkins);
    const alreadyOwned = owned.includes(skin.id);
    const refund = alreadyOwned ? CASE_DUPLICATE_REFUND : 0;
    const netCost = CASE_COST - refund;
    u.cudaCoins -= netCost;
    if (!alreadyOwned) {
      owned.push(skin.id);
      u.ownedSkins = JSON.stringify(owned);
    }
    const achievements = this._parseArray(u.achievements);
    if (!achievements.includes('big_spender')) {
      achievements.push('big_spender');
      u.achievements = JSON.stringify(achievements);
    }
    this._saveData();
    return {
      success: true,
      skin,
      isNew: !alreadyOwned,
      refund,
      profile: this._toProfile(u),
    };
  }

  async recordRunAchievements(userId: number, stats: { distance: number; cudaCores: number; flopsCollected: number; rareCds: number; pcBuildFast: boolean }): Promise<UserProfile> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) throw new Error("User not found");
    const wantsCd = Math.floor(stats.rareCds || 0) > 0;
    const runLongEnough = stats.distance >= RARE_CD_MIN_DISTANCE;
    const lastCd = rareCdCreditedAt.get(userId) ?? 0;
    const offCooldown = Date.now() - lastCd >= RARE_CD_COOLDOWN_MS;
    const cdGain = wantsCd && runLongEnough && offCooldown ? 1 : 0;
    if (cdGain > 0) rareCdCreditedAt.set(userId, Date.now());
    const unlocked = this._parseArray(u.achievements);
    const earned: string[] = [];
    if (!unlocked.includes('first_dash')) earned.push('first_dash');
    if (stats.cudaCores >= 1_000 && !unlocked.includes('core_1000')) earned.push('core_1000');
    if (stats.cudaCores >= 10_000 && !unlocked.includes('core_10000')) earned.push('core_10000');
    if (stats.distance >= 1_000 && !unlocked.includes('distance_1000')) earned.push('distance_1000');
    if (stats.distance >= 5_000 && !unlocked.includes('distance_5000')) earned.push('distance_5000');
    if (stats.flopsCollected >= 10 && !unlocked.includes('flops_10')) earned.push('flops_10');
    if (stats.pcBuildFast && !unlocked.includes('star_employee')) earned.push('star_employee');
    if (earned.length === 0 && cdGain === 0) return this._toProfile(u);
    u.achievements = JSON.stringify([...unlocked, ...earned]);
    u.rareCds += cdGain;
    this._saveData();
    return this._toProfile(u);
  }

  async giftRunbun(userId: number): Promise<{ success: boolean; message?: string; firstGift: boolean; profile: UserProfile }> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return { success: false, message: "User not found", firstGift: false, profile: null as any };
    if (u.rareCds <= 0) return { success: false, message: "You need a rare CD to give Runbun", firstGift: false, profile: this._toProfile(u) };
    const achievements = this._parseArray(u.achievements);
    const ownedSkins = this._parseArray(u.ownedSkins);
    const firstGift = !achievements.includes('redacted');
    if (firstGift) achievements.push('redacted');
    if (!ownedSkins.includes(SECRET_SKIN_ID)) ownedSkins.push(SECRET_SKIN_ID);
    u.rareCds -= 1;
    u.runbunGifted += 1;
    u.achievements = JSON.stringify(achievements);
    u.ownedSkins = JSON.stringify(ownedSkins);
    this._saveData();
    return { success: true, firstGift, profile: this._toProfile(u) };
  }

  async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
    const rows = await this.getHighScores(limit);
    return rows.map((row, idx) => ({ ...row, rank: getRank(row.cudaCoresCollected, idx + 1) }));
  }

  async getPublicProfile(userId: number): Promise<PublicProfile | null> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return null;
    const best = this.data.highScores
      .filter(h => h.userId === userId)
      .sort((a, b) => b.cudaCoresCollected - a.cudaCoresCollected)[0];
    const bestCores = best?.cudaCoresCollected ?? 0;
    const board = await this.getHighScores(1000);
    const idx = board.findIndex(row => row.userId === userId);
    const position = idx >= 0 ? idx + 1 : null;
    const ownedSkins = this._parseArray(u.ownedSkins);
    return {
      id: u.id,
      username: u.username,
      joinedAt: u.createdAt,
      bestCores,
      bestScore: best?.score ?? 0,
      bestDistance: best?.distance ?? 0,
      leaderboardPosition: position,
      rank: getRank(bestCores, position),
      achievements: this._parseArray(u.achievements),
      equippedSkin: u.equippedSkin || 'default',
      ownedSkinCount: Math.max(1, ownedSkins.length),
      hardDriveTier: u.hardDriveTier,
      cpuTier: u.cpuTier,
    };
  }

  async placeLotus(userId: number, checkpoint: LotusCheckpoint): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    if (u.lotuses <= 0) return { success: false, message: "Buy a Lotus before planting one", profile: this._toProfile(u) };
    if (u.lotusCheckpoint) return { success: false, message: "A Lotus is already planted", profile: this._toProfile(u) };
    u.lotuses -= 1;
    u.lotusCheckpoint = JSON.stringify(checkpoint);
    const achievements = this._parseArray(u.achievements);
    if (!achievements.includes('lotus_keeper')) {
      achievements.push('lotus_keeper');
      u.achievements = JSON.stringify(achievements);
    }
    this._saveData();
    return { success: true, profile: this._toProfile(u) };
  }

  async consumeLotusCheckpoint(userId: number): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    if (!u.lotusCheckpoint) return { success: false, message: "No planted Lotus checkpoint found", profile: this._toProfile(u) };
    u.lotusCheckpoint = null;
    this._saveData();
    return { success: true, profile: this._toProfile(u) };
  }

  async upgradeHardDrive(userId: number): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    if (u.hardDriveTier >= HD_MAX_TIER) return { success: false, message: "Already at max tier", profile: this._toProfile(u) };
    const nextTier = HARD_DRIVE_TIERS.find(t => t.tier === u.hardDriveTier + 1);
    if (!nextTier) return { success: false, message: "Invalid tier", profile: this._toProfile(u) };
    if (u.cudaCoins < nextTier.cost) return { success: false, message: `Need ${nextTier.cost} CUDA coins`, profile: this._toProfile(u) };
    u.cudaCoins -= nextTier.cost;
    u.hardDriveTier += 1;
    this._saveData();
    return { success: true, profile: this._toProfile(u) };
  }

  async upgradeCpu(userId: number): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    if (u.cpuTier >= CPU_MAX_TIER) return { success: false, message: "Already at max tier", profile: this._toProfile(u) };
    const nextTier = CPU_TIERS.find(t => t.tier === u.cpuTier + 1);
    if (!nextTier) return { success: false, message: "Invalid tier", profile: this._toProfile(u) };
    if (u.cudaCoins < nextTier.cost) return { success: false, message: `Need ${nextTier.cost} CUDA coins`, profile: this._toProfile(u) };
    u.cudaCoins -= nextTier.cost;
    u.cpuTier += 1;
    this._saveData();
    return { success: true, profile: this._toProfile(u) };
  }

  async claimCpuCoins(userId: number): Promise<{ success: boolean; message?: string; coins?: number; profile: UserProfile }> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    if (u.cpuTier <= 0) return { success: false, message: "No CPU unlocked", profile: this._toProfile(u) };
    const tier = CPU_TIERS.find(t => t.tier === u.cpuTier)!;
    const now = new Date();
    const lastClaimed = u.cpuLastClaimedAt ? new Date(u.cpuLastClaimedAt) : null;
    const CLAIM_MS = CPU_CLAIM_HOURS * 60 * 60 * 1000;
    if (lastClaimed && now.getTime() - lastClaimed.getTime() < CLAIM_MS) {
      const nextClaimIn = Math.ceil((CLAIM_MS - (now.getTime() - lastClaimed.getTime())) / (60 * 60 * 1000));
      return { success: false, message: `Next claim in ${nextClaimIn}h`, profile: this._toProfile(u) };
    }
    const hoursElapsed = lastClaimed ? (now.getTime() - lastClaimed.getTime()) / (60 * 60 * 1000) : CPU_CLAIM_HOURS;
    const periodsEarned = Math.min(Math.floor(hoursElapsed / CPU_CLAIM_HOURS), CPU_MAX_STORED_CLAIMS);
    const coinsEarned = tier.coinsPerClaim * periodsEarned;
    u.cudaCoins += coinsEarned;
    u.cpuLastClaimedAt = now.toISOString();
    this._saveData();
    return { success: true, coins: coinsEarned, profile: this._toProfile(u) };
  }

  async redeemCode(userId: number, code: string): Promise<{ success: boolean; message?: string; profile: UserProfile }> {
    const u = this.data.users.find(user => user.id === userId);
    if (!u) return { success: false, message: "User not found", profile: null as any };
    const normalized = code.trim().toLowerCase().replace(/\s+/g, ' ');
    const now = new Date();
    if (normalized === "supersecret") {
      if (u.superSecretRedeemedAt) {
        return { success: false, message: "SUPERSECRET has already been redeemed", profile: this._toProfile(u) };
      }
      u.rareCds += 1;
      u.superSecretRedeemedAt = now.toISOString();
      this._saveData();
      return { success: true, profile: this._toProfile(u) };
    }
    if (normalized === "happy dog") {
      const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
      const last = u.lastCodeRedeemedAt ? new Date(u.lastCodeRedeemedAt) : null;
      if (last && now.getTime() - last.getTime() < TWO_DAYS_MS) {
        const h = Math.ceil((TWO_DAYS_MS - (now.getTime() - last.getTime())) / (60 * 60 * 1000));
        return { success: false, message: `Wait ${h} more hours to redeem again`, profile: this._toProfile(u) };
      }
      u.cudaCoins += 400;
      u.lastCodeRedeemedAt = now.toISOString();
      this._saveData();
      return { success: true, profile: this._toProfile(u) };
    }
    if (normalized === "free revive") {
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const last = u.lastFreeReviveAt ? new Date(u.lastFreeReviveAt) : null;
      if (last && now.getTime() - last.getTime() < ONE_DAY_MS) {
        const h = Math.ceil((ONE_DAY_MS - (now.getTime() - last.getTime())) / (60 * 60 * 1000));
        return { success: false, message: `Come back in ${h}h for your next revive`, profile: this._toProfile(u) };
      }
      u.revives += 1;
      u.lastFreeReviveAt = now.toISOString();
      this._saveData();
      return { success: true, profile: this._toProfile(u) };
    }
    if (normalized === "remastered") {
      const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
      const last = u.lastRemasteredAt ? new Date(u.lastRemasteredAt) : null;
      if (last && now.getTime() - last.getTime() < TWO_WEEKS_MS) {
        const days = Math.ceil((TWO_WEEKS_MS - (now.getTime() - last.getTime())) / (24 * 60 * 60 * 1000));
        return { success: false, message: `Remastered resets in ${days} days`, profile: this._toProfile(u) };
      }
      u.lastRemasteredAt = now.toISOString();
      if (u.hardDriveTier < HD_MAX_TIER) {
        u.hardDriveTier += 1;
      } else if (u.cpuTier < CPU_MAX_TIER) {
        u.cpuTier += 1;
      } else {
        u.cudaCoins += 80;
      }
      this._saveData();
      return { success: true, profile: this._toProfile(u) };
    }
    return { success: false, message: "Invalid code", profile: this._toProfile(u) };
  }
  private _parseArray(value: string | null | undefined): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  private _toProfile(u: typeof users.$inferSelect): UserProfile {
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      cudaCoins: u.cudaCoins,
      revives: u.revives,
      headStarts: u.headStarts,
      luckyCharms: u.luckyCharms,
      overclocks: u.overclocks,
      hardDriveTier: u.hardDriveTier,
      cpuTier: u.cpuTier,
      sprintBoosts: u.sprintBoosts,
      coreDoublers: u.coreDoublers,
      ghostBoosts: u.ghostBoosts,
      lotuses: u.lotuses,
      achievements: this._parseArray(u.achievements),
      ownedSkins: this._parseArray(u.ownedSkins).length > 0 ? this._parseArray(u.ownedSkins) : ['default'],
      equippedSkin: u.equippedSkin || 'default',
      rareCds: u.rareCds,
      runbunGifted: u.runbunGifted,
      lotusCheckpoint: (() => {
        if (!u.lotusCheckpoint) return null;
        try {
          return JSON.parse(u.lotusCheckpoint) as LotusCheckpoint;
        } catch {
          return null;
        }
      })(),
      lastCodeRedeemedAt: u.lastCodeRedeemedAt?.toISOString() ?? null,
      lastFreeReviveAt: u.lastFreeReviveAt?.toISOString() ?? null,
      lastRemasteredAt: u.lastRemasteredAt?.toISOString() ?? null,
      cpuLastClaimedAt: u.cpuLastClaimedAt?.toISOString() ?? null,
    };
  }
}

export const storage: IStorage = (process.env.DATABASE_URL && db)
  ? new DatabaseStorage()
  : new FileStorage();
