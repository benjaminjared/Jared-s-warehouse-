import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Coins, Trash2, Users, Trophy, ChevronDown, ChevronUp, Shield, Gauge, Zap, Sparkles, Wand2, Key, Skull, Flame, RefreshCw } from "lucide-react";
import type { UserProfile, HighScoreResponse } from "@shared/schema";

function adminFetch(token: string, path: string, opts: RequestInit = {}) {
  return fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
  });
}

const EDITABLE_FIELDS = [
  { key: "cudaCoins",     label: "CUDA Coins"    },
  { key: "revives",       label: "Revives"       },
  { key: "headStarts",    label: "Head Starts"   },
  { key: "luckyCharms",   label: "Lucky Charms"  },
  { key: "overclocks",    label: "Overclocks"    },
  { key: "hardDriveTier", label: "HDD Tier (0-6)" },
  { key: "cpuTier",       label: "CPU Tier (0-6)" },
  { key: "sprintBoosts",  label: "Sprints"       },
  { key: "coreDoublers",  label: "Core Doublers" },
  { key: "ghostBoosts",   label: "Ghost Boosts"  },
  { key: "lotuses",       label: "Lotuses"       },
  { key: "rareCds",       label: "Rare CDs"      },
];

interface AdminPanelProps {
  onClose: () => void;
  token: string;
  speedMultiplier: number;
  invincible: boolean;
  onSpeedMultiplierChange: (value: number) => void;
  onInvincibleChange: (value: boolean) => void;
  currentProfile?: UserProfile | null;
  onProfileUpdate?: (profile: UserProfile) => void;
  onSpawnInFront?: (type: 'booster' | 'supernova' | 'megaboost' | 'jetsurge' | 'magnet' | 'jumpboost' | 'scarletrush' | 'cookie' | 'cores' | 'flop') => void;
  onNukeObstacles?: () => void;
  initialTab?: "users" | "scores" | "spawner";
}

export function AdminPanel({
  onClose,
  token,
  speedMultiplier,
  invincible,
  onSpeedMultiplierChange,
  onInvincibleChange,
  currentProfile,
  onProfileUpdate,
  onSpawnInFront,
  onNukeObstacles,
  initialTab,
}: AdminPanelProps) {
  const isUltraAdmin = currentProfile?.role === "ultra_admin" || currentProfile?.role === "super_admin";
  const [tab, setTab] = useState<"users" | "scores" | "spawner">(initialTab ?? (isUltraAdmin ? "spawner" : "users"));
  const [searchName, setSearchName] = useState("");
  const [foundUser, setFoundUser] = useState<UserProfile | null>(currentProfile ?? null);
  const [userError, setUserError] = useState("");
  const [allUsers, setAllUsers] = useState<UserProfile[] | null>(null);
  const [allScores, setAllScores] = useState<HighScoreResponse[] | null>(null);
  const [editField, setEditField] = useState("cudaCoins");
  const [editValue, setEditValue] = useState("");
  const [giveAmount, setGiveAmount] = useState("");
  const [newUsernameInput, setNewUsernameInput] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandUser, setExpandUser] = useState(true);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3500); };

  const lookupUser = async () => {
    if (!searchName.trim()) return;
    setLoading(true); setUserError(""); setFoundUser(null);
    const res = await adminFetch(token, `/api/admin/user/${encodeURIComponent(searchName.trim())}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setUserError(data.message ?? "Not found"); return; }
    setFoundUser(data.profile);
    setNewUsernameInput(data.profile.username);
  };

  const loadAllUsers = async () => {
    setLoading(true);
    const res = await adminFetch(token, "/api/admin/users");
    const data = await res.json();
    setLoading(false);
    if (res.ok) setAllUsers(data.users);
  };

  const loadScores = async () => {
    setLoading(true);
    const res = await adminFetch(token, "/api/admin/scores");
    const data = await res.json();
    setLoading(false);
    if (res.ok) setAllScores(data.scores);
  };

  const setField = async () => {
    if (!foundUser || editValue === "") return;
    setLoading(true);
    const res = await adminFetch(token, "/api/admin/set-field", {
      method: "POST",
      body: JSON.stringify({ username: foundUser.username, field: editField, value: Number(editValue) }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setFoundUser(data.profile);
      if (foundUser.id === currentProfile?.id && onProfileUpdate) onProfileUpdate(data.profile);
      flash(`✓ ${editField} set to ${editValue}`);
    } else flash(`✗ ${data.message}`);
  };

  const giveCoins = async (overrideAmt?: number) => {
    if (!foundUser) return;
    const amount = overrideAmt !== undefined ? overrideAmt : Number(giveAmount);
    if (!amount) return;
    setLoading(true);
    const res = await adminFetch(token, "/api/admin/give-coins", {
      method: "POST",
      body: JSON.stringify({ username: foundUser.username, amount }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setFoundUser(data.profile);
      if (foundUser.id === currentProfile?.id && onProfileUpdate) onProfileUpdate(data.profile);
      flash(`✓ Added ${amount.toLocaleString()} coins to ${foundUser.username}`);
      setGiveAmount("");
    } else flash(`✗ ${data.message}`);
  };

  const setRole = async (targetRole: "user" | "admin" | "ultra_admin") => {
    if (!foundUser) return;
    setLoading(true);
    const res = await adminFetch(token, "/api/admin/promote", {
      method: "POST",
      body: JSON.stringify({ username: foundUser.username, role: targetRole }),
    });
    setLoading(false);
    const data = await res.json();
    if (res.ok) {
      const updated = { ...foundUser, role: targetRole };
      setFoundUser(updated);
      if (foundUser.id === currentProfile?.id && onProfileUpdate) onProfileUpdate(updated);
      flash(`✓ Role set to ${targetRole.toUpperCase()}`);
    } else flash(`✗ ${data.message}`);
  };

  const changeUsername = async () => {
    if (!foundUser || !newUsernameInput.trim()) return;
    setLoading(true);
    const res = await adminFetch(token, "/api/admin/change-username", {
      method: "POST",
      body: JSON.stringify({ username: foundUser.username, newUsername: newUsernameInput.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setFoundUser(data.profile);
      if (foundUser.id === currentProfile?.id && onProfileUpdate) onProfileUpdate(data.profile);
      flash(`✓ Renamed account to ${data.profile.username}`);
      if (allUsers) loadAllUsers();
    } else flash(`✗ ${data.message}`);
  };

  const unlockAllSkins = async () => {
    if (!foundUser) return;
    setLoading(true);
    const res = await adminFetch(token, "/api/admin/unlock-all-skins", {
      method: "POST",
      body: JSON.stringify({ username: foundUser.username }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setFoundUser(data.profile);
      if (foundUser.id === currentProfile?.id && onProfileUpdate) onProfileUpdate(data.profile);
      flash("★ ALL SKINS UNLOCKED (SUPER & SECRET INCLUDED)!");
    } else flash(`✗ ${data.message}`);
  };

  const maxMasteries = async () => {
    if (!foundUser) return;
    setLoading(true);
    const res = await adminFetch(token, "/api/admin/max-masteries", {
      method: "POST",
      body: JSON.stringify({ username: foundUser.username }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setFoundUser(data.profile);
      if (foundUser.id === currentProfile?.id && onProfileUpdate) onProfileUpdate(data.profile);
      flash("★ MASTERIES MAXED (HDD 6 + DRAGON'S BREATH CPU 6)!");
    } else flash(`✗ ${data.message}`);
  };

  const deleteUser = async () => {
    if (!foundUser || !confirm(`DELETE user ${foundUser.username}? This cannot be undone.`)) return;
    setLoading(true);
    const res = await adminFetch(token, `/api/admin/user/${encodeURIComponent(foundUser.username)}`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) { setFoundUser(null); setSearchName(""); flash("✓ User deleted"); if (allUsers) loadAllUsers(); }
  };

  const deleteScore = async (id: number, name: string) => {
    if (!confirm(`Delete score by ${name}?`)) return;
    const res = await adminFetch(token, `/api/admin/score/${id}`, { method: "DELETE" });
    if (res.ok) { setAllScores(prev => prev?.filter(s => s.id !== id) ?? null); flash("✓ Score deleted"); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] bg-black/95 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-2xl bg-background border-2 border-red-500/60 overflow-hidden pixel-frame my-4"
        style={{
          boxShadow: isUltraAdmin
            ? "0 0 70px rgba(255,0,85,0.35), 0 0 120px rgba(255,200,0,0.15)"
            : "0 0 60px rgba(255,0,0,0.15), 0 0 120px rgba(255,0,0,0.05)"
        }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-950/90 via-purple-950/80 to-amber-950/90 border-b-2 border-red-500/50 px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-red-400 animate-pulse" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-arcade text-base text-red-300 tracking-widest">
                  {isUltraAdmin ? "⚡ ULTRA ADMIN TERMINAL" : "ADMIN PANEL"}
                </h2>
                {isUltraAdmin && (
                  <span className="font-arcade text-[8px] px-1.5 py-0.5 bg-gradient-to-r from-red-500 via-amber-400 to-cyan-400 text-black font-bold">
                    SUPER777
                  </span>
                )}
              </div>
              <p className="font-tech text-[10px] text-red-400/70 tracking-widest">
                LIVE IN-GAME SPAWNER & TOTAL ACCOUNT CONFIGURATION
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-red-500/50 hover:text-red-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Flash message */}
        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`px-6 py-2 font-tech text-xs text-center border-b ${
                msg.startsWith("✓") || msg.startsWith("★")
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-red-500/10 text-red-400 border-red-500/30"
              }`}
            >
              {msg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="flex border-b border-red-500/20">
          {(["users", "spawner", "scores"] as const).map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (t === "scores" && !allScores) loadScores();
                if (t === "users" && !allUsers) loadAllUsers();
              }}
              className={`flex-1 py-2.5 font-arcade text-[10px] tracking-widest transition-colors flex items-center justify-center gap-2 ${
                tab === t
                  ? "bg-red-900/25 text-red-300 border-b-2 border-red-500"
                  : "text-red-600 hover:text-red-400"
              }`}
            >
              {t === "users" ? (
                <><Users className="w-3.5 h-3.5" /> ACCOUNTS</>
              ) : t === "spawner" ? (
                <><Zap className="w-3.5 h-3.5 text-yellow-400" /> LIVE SPAWNER</>
              ) : (
                <><Trophy className="w-3.5 h-3.5" /> SCORES</>
              )}
            </button>
          ))}
        </div>

        {/* LIVE IN-GAME SPAWNER TAB */}
        {tab === "spawner" && (
          <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Real-time Spawner */}
            <div className="border border-red-500/40 bg-red-950/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wand2 className="w-4 h-4 text-yellow-400" />
                <span className="font-arcade text-xs text-yellow-300 tracking-widest">
                  SPAWN POWERUPS IN FRONT OF RUNNER
                </span>
              </div>
              <p className="font-tech text-xs text-muted-foreground mb-3">
                Spawns the exact item directly ahead of your runner mid-stride:
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-arcade text-[8px]">
                <button
                  onClick={() => { onSpawnInFront?.('booster'); flash("⚡ BOOSTER spawned in front!"); }}
                  className="p-2.5 border border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 text-center"
                >
                  ⚡ BOOSTER
                </button>
                <button
                  onClick={() => { onSpawnInFront?.('supernova'); flash("💥 SUPERNOVA 250× spawned in front!"); }}
                  className="p-2.5 border border-pink-500/40 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20 text-center"
                >
                  💥 SUPERNOVA
                </button>
                <button
                  onClick={() => { onSpawnInFront?.('cookie'); flash("🍪 JAMEO COOKIE 70× spawned in front!"); }}
                  className="p-2.5 border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-center"
                >
                  🍪 COOKIE
                </button>
                <button
                  onClick={() => { onSpawnInFront?.('cores'); flash("💎 50K CORES CLUSTER spawned!"); }}
                  className="p-2.5 border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 text-center"
                >
                  💎 50K CORES
                </button>
                <button
                  onClick={() => { onSpawnInFront?.('megaboost'); flash("🟩 MEGA BOOST 50× spawned!"); }}
                  className="p-2.5 border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-center"
                >
                  🟩 MEGA BOOST
                </button>
                <button
                  onClick={() => { onSpawnInFront?.('jetsurge'); flash("🔥 JET SURGE spawned!"); }}
                  className="p-2.5 border border-orange-600/40 bg-orange-600/10 text-orange-300 hover:bg-orange-600/20 text-center"
                >
                  🔥 JET SURGE
                </button>
                <button
                  onClick={() => { onSpawnInFront?.('magnet'); flash("🧲 MAGNET spawned!"); }}
                  className="p-2.5 border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-center"
                >
                  🧲 MAGNET
                </button>
                <button
                  onClick={() => { onSpawnInFront?.('flop'); flash("🌸 FLOP spawned!"); }}
                  className="p-2.5 border border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 text-center"
                >
                  🌸 FLOP
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-red-500/20 flex gap-2">
                <button
                  onClick={() => {
                    onNukeObstacles?.();
                    flash("☢️ ALL ACTIVE OBSTACLES VAPORIZED!");
                  }}
                  className="flex-1 py-3 border-2 border-red-500 bg-red-600/20 text-red-200 hover:bg-red-600/40 font-arcade text-[10px] tracking-widest flex items-center justify-center gap-2"
                >
                  <Skull className="w-4 h-4 text-red-400" /> NUKE ALL OBSTACLES
                </button>
              </div>
            </div>

            {/* Run Mechanics Overrides */}
            <div className="border border-red-500/40 bg-black/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Gauge className="w-4 h-4 text-orange-400" />
                <span className="font-arcade text-xs text-orange-300 tracking-widest">
                  WARP VELOCITY & GODMODE
                </span>
              </div>

              <div className="space-y-3 font-tech text-xs">
                <div>
                  <div className="text-muted-foreground mb-1.5 font-arcade text-[9px]">SPEED MULTIPLIER:</div>
                  <div className="flex flex-wrap gap-1.5 font-arcade text-[9px]">
                    {[0.5, 1, 1.5, 2, 3, 5, 10].map(s => (
                      <button
                        key={s}
                        onClick={() => { onSpeedMultiplierChange(s); flash(`Speed set to ${s}×`); }}
                        className={`px-3 py-1.5 border transition-colors ${
                          speedMultiplier === s
                            ? "border-orange-400 bg-orange-400/20 text-orange-300 font-bold"
                            : "border-red-500/30 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      const next = !invincible;
                      onInvincibleChange(next);
                      flash(next ? "GODMODE (INVINCIBILITY) ACTIVATED" : "GODMODE DEACTIVATED");
                    }}
                    className={`w-full py-2.5 border font-arcade text-[10px] tracking-widest flex items-center justify-center gap-2 transition-colors ${
                      invincible
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                        : "border-red-500/30 text-red-500/60 hover:text-red-300"
                    }`}
                  >
                    <Zap className="w-4 h-4" /> {invincible ? "★ GODMODE ACTIVE (CANNOT DIE) ★" : "ACTIVATE GODMODE"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ACCOUNTS TAB */}
        {tab === "users" && (
          <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Search */}
            <div className="flex gap-2">
              <input
                value={searchName}
                onChange={e => setSearchName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") lookupUser(); }}
                placeholder="Search username or select your account..."
                className="flex-1 bg-black border border-red-500/30 px-3 py-2 font-tech text-sm text-red-300 placeholder:text-red-800 focus:outline-none focus:border-red-500/60"
              />
              <button
                onClick={lookupUser}
                disabled={loading}
                className="px-4 py-2 border border-red-500/40 text-red-400 font-arcade text-[9px] tracking-widest hover:bg-red-500/10 disabled:opacity-30"
              >
                <Search className="w-4 h-4" />
              </button>
              {currentProfile && (
                <button
                  onClick={() => { setFoundUser(currentProfile); setSearchName(currentProfile.username); setNewUsernameInput(currentProfile.username); }}
                  className="px-3 py-2 border border-red-500/30 text-red-300 font-arcade text-[8px] tracking-wider hover:bg-red-500/10"
                >
                  ME
                </button>
              )}
            </div>

            {userError && <p className="font-tech text-xs text-red-400">{userError}</p>}

            {/* Found user panel with Full Ultra Controls */}
            {foundUser && (
              <div className="border border-red-500/30 bg-red-950/20">
                <button
                  onClick={() => setExpandUser(e => !e)}
                  className="w-full px-4 py-3 flex items-center justify-between border-b border-red-500/20"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-arcade text-sm text-red-300">{foundUser.username}</span>
                    <span className="font-arcade text-[8px] px-2 py-0.5 bg-red-500/20 border border-red-500/40 text-red-300">
                      ROLE: {foundUser.role.toUpperCase()}
                    </span>
                    <span className="font-tech text-xs text-yellow-400">{foundUser.cudaCoins.toLocaleString()} coins</span>
                  </div>
                  {expandUser ? <ChevronUp className="w-4 h-4 text-red-500/50" /> : <ChevronDown className="w-4 h-4 text-red-500/50" />}
                </button>

                {expandUser && (
                  <div className="p-4 space-y-4">
                    {/* Ultra Admin One-Click Supertools */}
                    <div className="p-3 border border-red-500/30 bg-black/40 space-y-2">
                      <div className="font-arcade text-[9px] text-yellow-300 tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-yellow-400" /> ULTRA ADMIN ACTIONS
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-arcade text-[9px]">
                        <button
                          onClick={unlockAllSkins}
                          disabled={loading}
                          className="py-2.5 px-3 border border-pink-500/50 bg-pink-500/10 hover:bg-pink-500/25 text-pink-300 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> UNLOCK ALL SKINS (SUPER & SECRET)
                        </button>

                        <button
                          onClick={maxMasteries}
                          disabled={loading}
                          className="py-2.5 px-3 border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Flame className="w-3.5 h-3.5" /> MAX MASTERIES (TIER 6 HDD & CPU)
                        </button>
                      </div>

                      {/* Quick coin buttons */}
                      <div className="pt-2 flex items-center gap-1.5 font-arcade text-[8px]">
                        <span className="text-yellow-400">ADD COINS:</span>
                        {[10000, 100000, 1000000].map(amt => (
                          <button
                            key={amt}
                            onClick={() => giveCoins(amt)}
                            disabled={loading}
                            className="px-2 py-1 border border-yellow-500/40 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/25"
                          >
                            +{amt.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Change Username & Role Settings */}
                    <div className="p-3 border border-red-500/20 bg-black/30 space-y-3 font-tech text-xs">
                      <div className="font-arcade text-[9px] text-red-300 tracking-wider flex items-center gap-1">
                        <Key className="w-3.5 h-3.5" /> ACCOUNT CREDENTIALS & PERMISSIONS
                      </div>

                      {/* Rename account */}
                      <div className="flex gap-2 items-center">
                        <label className="font-arcade text-[9px] text-muted-foreground w-20">USERNAME:</label>
                        <input
                          value={newUsernameInput}
                          onChange={e => setNewUsernameInput(e.target.value)}
                          placeholder="New username..."
                          maxLength={16}
                          className="flex-1 bg-black border border-red-500/30 px-3 py-1.5 font-tech text-xs text-red-300 focus:outline-none focus:border-red-500/60"
                        />
                        <button
                          onClick={changeUsername}
                          disabled={loading || !newUsernameInput.trim() || newUsernameInput.trim().toUpperCase() === foundUser.username}
                          className="px-3 py-1.5 border border-red-500/50 text-red-300 hover:bg-red-500/15 font-arcade text-[8px] tracking-widest disabled:opacity-30"
                        >
                          SAVE NAME
                        </button>
                      </div>

                      {/* Change role */}
                      <div className="flex gap-2 items-center">
                        <label className="font-arcade text-[9px] text-muted-foreground w-20">ROLE:</label>
                        <div className="flex gap-2 flex-1">
                          {(["user", "admin", "ultra_admin"] as const).map(r => (
                            <button
                              key={r}
                              onClick={() => setRole(r)}
                              disabled={loading || foundUser.role === r}
                              className={`flex-1 py-1 px-2 border font-arcade text-[8px] tracking-wider transition-colors ${
                                foundUser.role === r
                                  ? "border-red-400 bg-red-500/20 text-red-300 font-bold"
                                  : "border-red-500/30 text-muted-foreground hover:text-red-300"
                              }`}
                            >
                              {r.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                      {EDITABLE_FIELDS.map(f => (
                        <div key={f.key} className="flex justify-between font-tech text-[10px] px-2 py-1 bg-red-500/5 border border-red-500/10">
                          <span className="text-red-500/60">{f.label}</span>
                          <span className="text-red-300 font-arcade text-[9px]">{(foundUser as any)[f.key] ?? 0}</span>
                        </div>
                      ))}
                    </div>

                    {/* Custom Value Setter */}
                    <div className="flex gap-2 pt-1">
                      <select
                        value={editField}
                        onChange={e => setEditField(e.target.value)}
                        className="flex-1 bg-black border border-red-500/30 px-2 py-2 font-tech text-xs text-red-300 focus:outline-none"
                      >
                        {EDITABLE_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                      <input
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        placeholder="Value"
                        className="w-24 bg-black border border-red-500/30 px-2 py-2 font-tech text-xs text-red-300 placeholder:text-red-800 focus:outline-none"
                      />
                      <button
                        onClick={setField}
                        disabled={loading || editValue === ""}
                        className="px-4 py-2 border border-red-500/50 text-red-300 font-arcade text-[9px] tracking-widest hover:bg-red-500/15 disabled:opacity-30"
                      >
                        SET VALUE
                      </button>
                    </div>

                    {/* Delete user */}
                    <div className="pt-2">
                      <button
                        onClick={deleteUser}
                        disabled={loading}
                        className="w-full py-2 border border-red-700/50 text-red-600 hover:bg-red-900/30 hover:text-red-400 font-arcade text-[9px] tracking-widest disabled:opacity-30 flex items-center justify-center gap-2 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> DELETE USER ACCOUNT
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* All users list */}
            {allUsers && (
              <div className="border border-red-500/15 divide-y divide-red-500/10">
                <div className="px-3 py-2 flex justify-between font-arcade text-[8px] text-red-500/50 tracking-widest bg-red-950/20">
                  <span>USERNAME</span>
                  <span>ROLE · COINS · MASTERIES</span>
                </div>
                {allUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setFoundUser(u); setSearchName(u.username); setNewUsernameInput(u.username); setExpandUser(true); }}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-red-500/5 transition-colors"
                  >
                    <span className="font-tech text-xs text-red-300">{u.username}</span>
                    <span className="font-tech text-[10px] text-red-500/70">
                      {u.role.toUpperCase()} · {u.cudaCoins.toLocaleString()}c · HD{u.hardDriveTier} · CPU{u.cpuTier}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCORES TAB */}
        {tab === "scores" && (
          <div className="p-5 space-y-2 max-h-[65vh] overflow-y-auto">
            {loading && <p className="font-tech text-xs text-red-500/60 text-center py-4">Loading scores...</p>}
            {allScores && allScores.map(s => (
              <div key={s.id} className="flex items-center justify-between border border-red-500/10 px-3 py-2 hover:bg-red-500/5">
                <div>
                  <span className="font-arcade text-[10px] text-red-300">{s.playerName}</span>
                  <span className="font-tech text-[10px] text-red-500/50 ml-3">
                    {s.cudaCoresCollected.toLocaleString()} cores · {s.distance}m · Score: {s.score}
                  </span>
                </div>
                <button
                  onClick={() => deleteScore(s.id, s.playerName)}
                  className="text-red-700 hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {allScores?.length === 0 && (
              <p className="font-tech text-xs text-red-500/40 text-center py-4">No scores found</p>
            )}
          </div>
        )}

        <div className="px-6 py-2.5 border-t border-red-500/15 bg-red-950/20 flex items-center justify-between">
          <p className="font-tech text-[10px] text-red-400/50 tracking-widest">
            {isUltraAdmin ? "⚡ ULTRA ADMIN ROOT PRIVILEGES ENABLED" : "STANDARD DEVELOPER PRIVILEGES"}
          </p>
          <p className="font-arcade text-[9px] text-red-500/40">CODE: SUPER777SUPER</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
