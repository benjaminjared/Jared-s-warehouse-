import type { Express } from "express";
import type { Server } from "http";
import { db } from "./db";
import { storage, hashPassword } from "./storage";
import { api } from "@shared/routes";
import { users, SHOP_ITEMS, SKINS, type ShopItemId, type LotusCheckpoint } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const sessions = new Map<string, number>(); // token -> userId
const DEVELOPER_ACCESS_CODE = process.env.DEVELOPER_ACCESS_CODE ?? "ADMINACCESS777";

function generateToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function seedDatabase() {
  const existingScores = await storage.getHighScores(1);
  if (existingScores.length === 0) {
    await storage.createHighScore({ playerName: "SpeedRunner",    userId: null, password: null, score: 15420,  cudaCoresCollected: 2048,  distance: 3850 });
    await storage.createHighScore({ playerName: "WarehouseKing",  userId: null, password: null, score: 12890,  cudaCoresCollected: 1536,  distance: 3210 });
    await storage.createHighScore({ playerName: "JumpMaster",     userId: null, password: null, score: 10560,  cudaCoresCollected: 1280,  distance: 2640 });
    await storage.createHighScore({ playerName: "CudaCollector",  userId: null, password: null, score: 9870,   cudaCoresCollected: 1920,  distance: 2150 });
    await storage.createHighScore({ playerName: "DashPro",        userId: null, password: null, score: 8450,   cudaCoresCollected: 1024,  distance: 2050 });
    console.log("✅ Database seeded with example high scores");
  }
}

function getSession(req: any): number | null {
  const auth = req.headers.authorization;
  const token = auth?.replace("Bearer ", "");
  if (!token || !sessions.has(token)) return null;
  return sessions.get(token)!;
}

/** Resolve a bearer token to a user id (used by the WebSocket race server). */
export function resolveSessionToken(token: string | null | undefined): number | null {
  if (!token || !sessions.has(token)) return null;
  return sessions.get(token)!;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await seedDatabase();

  // ── AUTH ─────────────────────────────────────────

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = z.object({
        username: z.string().min(2).max(16).regex(/^[a-zA-Z0-9_]+$/),
        password: z.string().min(3).max(64),
      }).parse(req.body);

      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(409).json({ message: "Username already taken" });

      const profile = await storage.createUser(username, hashPassword(password));
      const token = generateToken();
      sessions.set(token, profile.id);
      res.status(201).json({ token, profile });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error("Register error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = z.object({
        username: z.string(),
        password: z.string(),
      }).parse(req.body);

      const user = await storage.getUserByUsername(username);
      if (!user || user.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      const token = generateToken();
      sessions.set(token, user.id);
      const { passwordHash: _, ...profile } = user;
      res.json({ token, profile });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const profile = await storage.getUserById(userId);
    if (!profile) return res.status(401).json({ message: "User not found" });
    res.json({ profile });
  });

  app.post("/api/auth/logout", (req, res) => {
    const auth = req.headers.authorization;
    const token = auth?.replace("Bearer ", "");
    if (token) sessions.delete(token);
    res.json({ ok: true });
  });

  // ── SHOP ─────────────────────────────────────────

  app.get("/api/shop/items", (_req, res) => {
    res.json(SHOP_ITEMS);
  });

  app.post("/api/shop/buy", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Login required to use the shop" });

    try {
      const { itemId } = z.object({ itemId: z.string() }).parse(req.body);
      const result = await storage.buyShopItem(userId, itemId as ShopItemId);
      if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
      res.json({ profile: result.profile });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error("Shop buy error:", err);
      res.status(500).json({ message: "Purchase failed" });
    }
  });

  app.get("/api/shop/skins", (_req, res) => {
    res.json(SKINS);
  });

  app.post("/api/shop/skins/buy", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Login required to use the shop" });
    try {
      const { skinId } = z.object({ skinId: z.string() }).parse(req.body);
      const result = await storage.buySkin(userId, skinId as any);
      if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
      res.json({ profile: result.profile });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Skin purchase failed" });
    }
  });

  app.post("/api/shop/skins/equip", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Login required to equip a skin" });
    try {
      const { skinId } = z.object({ skinId: z.string() }).parse(req.body);
      const result = await storage.equipSkin(userId, skinId as any);
      if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
      res.json({ profile: result.profile });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Failed to equip skin" });
    }
  });

  app.post("/api/shop/case/open", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Login required to open a case" });
    try {
      const result = await storage.openSkinCase(userId);
      if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
      res.json(result);
    } catch (err) {
      console.error("Open skin case error:", err);
      res.status(500).json({ message: "Failed to open case" });
    }
  });

  app.post("/api/user/place-lotus", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    try {
      const checkpoint = z.object({
        distance: z.number().finite().min(0),
        cudaCores: z.number().int().min(0),
        score: z.number().int().min(0),
        flopsCollected: z.number().int().min(0),
      }).parse(req.body) as LotusCheckpoint;
      const result = await storage.placeLotus(userId, checkpoint);
      if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
      res.json({ profile: result.profile });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid Lotus checkpoint" });
      res.status(500).json({ message: "Failed to plant Lotus" });
    }
  });

  app.post("/api/user/use-lotus", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const result = await storage.consumeLotusCheckpoint(userId);
    if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
    res.json({ profile: result.profile });
  });

  // ── USER ─────────────────────────────────────────

  app.post("/api/user/gift-runbun", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const result = await storage.giftRunbun(userId);
      if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
      res.json({ profile: result.profile, firstGift: result.firstGift });
    } catch (err) {
      console.error("Runbun gift error:", err);
      res.status(500).json({ message: "Runbun refused the CD" });
    }
  });

  // ── PUBLIC PLAYER PAGES ─────────────────────────

  app.get("/api/players/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid player id" });
    try {
      const profile = await storage.getPublicProfile(id);
      if (!profile) return res.status(404).json({ message: "Player not found" });
      res.json(profile);
    } catch (err) {
      console.error("Public profile error:", err);
      res.status(500).json({ message: "Failed to load player" });
    }
  });

  app.post("/api/user/award-coins", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    try {
      const { cudaCores } = z.object({ cudaCores: z.number().int().min(0) }).parse(req.body);
      const coinsEarned = Math.floor(cudaCores / 1_000_000) * 2;
      if (coinsEarned <= 0) {
        const profile = await storage.getUserById(userId);
        return res.json({ coinsEarned: 0, profile });
      }
      const profile = await storage.awardCudaCoins(userId, coinsEarned);
      res.json({ coinsEarned, profile });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Failed to award coins" });
    }
  });

  app.post("/api/user/use-revive", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const profile = await storage.consumeItem(userId, 'revives');
    if (!profile) return res.status(400).json({ message: "No revives available" });
    res.json({ profile });
  });

  app.post("/api/user/consume-start-items", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const body = z.object({
        headStart:   z.boolean().optional(),
        overclock:   z.boolean().optional(),
        luckyCharm:  z.boolean().optional(),
        sprint:      z.boolean().optional(),
        coreDoubler: z.boolean().optional(),
        ghost:       z.boolean().optional(),
      }).parse(req.body);
      let profile = await storage.getUserById(userId);
      if (body.headStart   && profile && profile.headStarts   > 0) profile = await storage.consumeItem(userId, 'headStarts')   ?? profile;
      if (body.overclock   && profile && profile.overclocks   > 0) profile = await storage.consumeItem(userId, 'overclocks')   ?? profile;
      if (body.luckyCharm  && profile && profile.luckyCharms  > 0) profile = await storage.consumeItem(userId, 'luckyCharms')  ?? profile;
      if (body.sprint      && profile && profile.sprintBoosts > 0) profile = await storage.consumeItem(userId, 'sprintBoosts') ?? profile;
      if (body.coreDoubler && profile && profile.coreDoublers > 0) profile = await storage.consumeItem(userId, 'coreDoublers') ?? profile;
      if (body.ghost       && profile && profile.ghostBoosts  > 0) profile = await storage.consumeItem(userId, 'ghostBoosts')  ?? profile;
      res.json({ profile });
    } catch (err) {
      res.status(500).json({ message: "Failed to consume items" });
    }
  });

  app.post("/api/user/upgrade-harddrive", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const result = await storage.upgradeHardDrive(userId);
    if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
    res.json({ profile: result.profile });
  });

  app.post("/api/user/upgrade-cpu", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const result = await storage.upgradeCpu(userId);
    if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
    res.json({ profile: result.profile });
  });

  app.post("/api/user/claim-cpu-coins", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const result = await storage.claimCpuCoins(userId);
    if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
    res.json({ coins: result.coins, profile: result.profile });
  });

  app.post("/api/user/redeem-code", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const body = z.object({ code: z.string() }).parse(req.body);
      const result = await storage.redeemCode(userId, body.code);
      if (!result.success) return res.status(400).json({ message: result.message, profile: result.profile });
      res.json({ profile: result.profile });
    } catch (err) {
      res.status(500).json({ message: "Failed to redeem code" });
    }
  });

  // ── HIGH SCORES ──────────────────────────────────

  app.get(api.highScores.list.path, async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const scores = await storage.getLeaderboard(limit);
      res.json(scores);
    } catch (error) {
      console.error("Error fetching high scores:", error);
      res.status(500).json({ message: "Failed to fetch high scores" });
    }
  });

  app.post(api.highScores.create.path, async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Account required to save scores" });

    try {
      const userProfile = await storage.getUserById(userId);
      if (!userProfile) return res.status(401).json({ message: "User not found" });

      const body = z.object({
        score: z.number().int(),
        cudaCoresCollected: z.number().int(),
        distance: z.number().int(),
        flopsCollected: z.number().int().min(0).optional(),
        rareCds: z.number().int().min(0).max(5).optional(),
        pcBuildFast: z.boolean().optional(),
      }).parse(req.body);

      const newScore = await storage.upsertHighScore({
        playerName: userProfile.username,
        userId,
        password: null,
        score: body.score,
        cudaCoresCollected: body.cudaCoresCollected,
        distance: body.distance,
      });
      await storage.recordRunAchievements(userId, {
        distance: body.distance,
        cudaCores: body.cudaCoresCollected,
        flopsCollected: body.flopsCollected ?? 0,
        rareCds: body.rareCds ?? 0,
        pcBuildFast: body.pcBuildFast ?? false,
      });
      const profile = await storage.getUserById(userId);

      res.status(201).json({ ...newScore, profile });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error("Error creating high score:", err);
      res.status(500).json({ message: "Failed to save score" });
    }
  });

  // ── ADMIN ─────────────────────────────────────────

  const adminAllowedFields = ['cudaCoins','revives','headStarts','luckyCharms','overclocks',
                               'hardDriveTier','cpuTier','sprintBoosts','coreDoublers','ghostBoosts','lotuses','rareCds'];

  const SUPER_ADMIN_CODE = "super777super";

  app.post("/api/admin/unlock", async (req, res) => {
    const userId = getSession(req);
    if (!userId) return res.status(401).json({ message: "Log in before unlocking developer access" });

    try {
      const body = z.object({ code: z.string().min(1).max(64) }).parse(req.body);
      const trimmed = body.code.trim();

      if (trimmed.toLowerCase() === SUPER_ADMIN_CODE.toLowerCase()) {
        const profile = await storage.setUserRole(userId, "ultra_admin");
        return res.json({ profile, role: "ultra_admin", message: "⚡ ULTRA ADMIN UNLOCKED ⚡" });
      }

      if (trimmed === DEVELOPER_ACCESS_CODE) {
        const profile = await storage.setUserRole(userId, "admin");
        return res.json({ profile, role: "admin", message: "Developer access unlocked" });
      }

      return res.status(403).json({ message: "Invalid access code" });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: "Invalid access code" });
      console.error("Developer unlock error:", err);
      res.status(500).json({ message: "Developer unlock failed" });
    }
  });

  async function checkAdmin(req: any, res: any): Promise<{ userId: number; user: UserProfile } | false> {
    const userId = getSession(req);
    if (!userId) { res.status(401).json({ message: "Not authenticated" }); return false; }
    const user = await storage.getUserById(userId);
    if (!user || (user.role !== "admin" && user.role !== "ultra_admin" && user.role !== "super_admin")) {
      res.status(403).json({ message: "Forbidden" });
      return false;
    }
    return { userId, user };
  }

  app.post("/api/admin/promote", async (req, res) => {
    const adminCheck = await checkAdmin(req, res);
    if (!adminCheck) return;
    try {
      const body = z.object({ username: z.string(), role: z.enum(["user", "admin", "ultra_admin"]).optional() }).parse(req.body);
      const target = await storage.getUserByUsername(body.username);
      if (!target) return res.status(404).json({ message: "User not found" });
      const newRole = body.role ?? "admin";
      const profile = await storage.setUserRole(target.id, newRole);
      res.json({ ok: true, profile });
    } catch (err) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.post("/api/admin/change-username", async (req, res) => {
    const adminCheck = await checkAdmin(req, res);
    if (!adminCheck) return;
    try {
      const body = z.object({
        username: z.string(),
        newUsername: z.string().min(2).max(16).regex(/^[a-zA-Z0-9_]+$/)
      }).parse(req.body);
      const target = await storage.getUserByUsername(body.username);
      if (!target) return res.status(404).json({ message: "User not found" });
      const profile = await storage.adminChangeUsername(target.id, body.newUsername);
      res.json({ ok: true, profile });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to change username" });
    }
  });

  app.post("/api/admin/unlock-all-skins", async (req, res) => {
    const adminCheck = await checkAdmin(req, res);
    if (!adminCheck) return;
    try {
      const body = z.object({ username: z.string() }).parse(req.body);
      const target = await storage.getUserByUsername(body.username);
      if (!target) return res.status(404).json({ message: "User not found" });
      const profile = await storage.adminUnlockAllSkins(target.id);
      res.json({ ok: true, profile });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to unlock skins" });
    }
  });

  app.post("/api/admin/max-masteries", async (req, res) => {
    const adminCheck = await checkAdmin(req, res);
    if (!adminCheck) return;
    try {
      const body = z.object({ username: z.string() }).parse(req.body);
      const target = await storage.getUserByUsername(body.username);
      if (!target) return res.status(404).json({ message: "User not found" });
      const profile = await storage.adminMaxMasteries(target.id);
      res.json({ ok: true, profile });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to max masteries" });
    }
  });

  app.get("/api/admin/users", async (req, res) => {
    if (!await checkAdmin(req, res)) return;
    const allUsers = await storage.getAllUsers();
    res.json({ users: allUsers });
  });

  app.get("/api/admin/user/:username", async (req, res) => {
    if (!await checkAdmin(req, res)) return;
    const user = await storage.getUserByUsername(req.params.username);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { passwordHash: _, ...profile } = user;
    res.json({ profile });
  });

  app.post("/api/admin/set-field", async (req, res) => {
    if (!await checkAdmin(req, res)) return;
    try {
      const body = z.object({ username: z.string(), field: z.string(), value: z.number() }).parse(req.body);
      if (!adminAllowedFields.includes(body.field)) return res.status(400).json({ message: "Field not allowed" });
      const user = await storage.getUserByUsername(body.username);
      if (!user) return res.status(404).json({ message: "User not found" });
      const profile = await storage.adminSetField(user.id, body.field, body.value);
      res.json({ profile });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Failed" });
    }
  });

  app.post("/api/admin/give-coins", async (req, res) => {
    if (!await checkAdmin(req, res)) return;
    try {
      const body = z.object({ username: z.string(), amount: z.number().int() }).parse(req.body);
      const user = await storage.getUserByUsername(body.username);
      if (!user) return res.status(404).json({ message: "User not found" });
      const profile = await storage.awardCudaCoins(user.id, body.amount);
      res.json({ profile });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Failed" });
    }
  });

  app.delete("/api/admin/user/:username", async (req, res) => {
    if (!await checkAdmin(req, res)) return;
    const user = await storage.getUserByUsername(req.params.username);
    if (!user) return res.status(404).json({ message: "User not found" });
    await storage.adminDeleteUser(user.id);
    res.json({ ok: true });
  });

  app.get("/api/admin/scores", async (req, res) => {
    if (!await checkAdmin(req, res)) return;
    const scores = await storage.getAllHighScores();
    res.json({ scores });
  });

  app.delete("/api/admin/score/:id", async (req, res) => {
    if (!await checkAdmin(req, res)) return;
    await storage.deleteHighScore(Number(req.params.id));
    res.json({ ok: true });
  });

  return httpServer;
}
