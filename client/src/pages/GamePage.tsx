import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GameEngine, GameStats, GameState } from "@/lib/game-engine";
import { Leaderboard } from "@/components/Leaderboard";
import { GameOverModal } from "@/components/GameOverModal";
import { AuthModal } from "@/components/AuthModal";
import { BobsShop } from "@/components/BobsShop";
import { AccountPanel } from "@/components/AccountPanel";
import { AdminPanel } from "@/components/AdminPanel";
import { RaceLobby } from "@/components/RaceLobby";
import { RaceHud } from "@/components/RaceHud";
import { RaceResults } from "@/components/RaceResults";
import { PcBuildMinigame } from "@/components/PcBuildMinigame";
import { RankQuestBoard } from "@/components/RankQuestBoard";
import { useRace } from "@/hooks/use-race";
import { usePublicProfile } from "@/hooks/use-high-scores";
import { getRankQuests } from "@/lib/rank-quests";
import { useQuestRun } from "@/hooks/use-quest-run";
import type { RaceRoomState } from "@shared/race";
import { useAuth } from "@/hooks/use-auth";
import { LogIn, LogOut, Coins, ShoppingBag, User, Heart, HardDrive, Shield, Flower2, Award, DoorOpen, Disc3, Users } from "lucide-react";
import { HARD_DRIVE_TIERS, SKINS } from "@shared/schema";
import type { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import warehouseLogo from "@/assets/jareds-warehouse-logo.png";
import runbunWithCd from "@/assets/runbun-with-cd.png";
import runbunWithoutCd from "@/assets/runbun-without-cd.png";

const TICKER_TEXT = Array(2).fill(
  ">>> JARED'S WAREHOUSE \u00a0\u00a0 COLLECT CUDA CORES \u00a0\u00a0 DODGE BOXES \u00a0\u00a0 FIND FLOPS \u00a0\u00a0 SILICON LOTTERY \u00a0\u00a0 VISIT JEFF'S SHOP \u00a0\u00a0 DON'T GET FIRED \u00a0\u00a0 "
).join("");

type RevivePrompt = { accept: () => void; decline: () => void };

export default function GamePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [finalStats, setFinalStats] = useState<GameStats | null>(null);
  const [runbunPetCount, setRunbunPetCount] = useState(0);
  const [showAuth, setShowAuth] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showDeveloperUnlock, setShowDeveloperUnlock] = useState(false);
  const [developerCode, setDeveloperCode] = useState("");
  const [developerUnlockError, setDeveloperUnlockError] = useState("");
  const [developerSpeedMultiplier, setDeveloperSpeedMultiplier] = useState(1);
  const [developerInvincible, setDeveloperInvincible] = useState(false);
  const [revivePrompt, setRevivePrompt] = useState<RevivePrompt | null>(null);
  const [revivesLeft, setRevivesLeft] = useState(0);
  const [showRaceLobby, setShowRaceLobby] = useState(false);
  const [raceActive, setRaceActive] = useState(false);
  const [showRaceResults, setShowRaceResults] = useState(false);
  const [giftingCd, setGiftingCd] = useState(false);
  const [showPcBuild, setShowPcBuild] = useState(false);
  const [questRotation, setQuestRotation] = useState(0);
  const questRun = useQuestRun();
  const questRunRef = useRef(questRun);
  questRunRef.current = questRun;
  const startRequestRef = useRef<() => void>(() => {});
  const [loadout, setLoadout] = useState<Record<string, boolean>>({
    headStart: true, overclock: true, luckyCharm: true, sprint: true, coreDoubler: true, hardDrive: true, ghost: true,
  });
  const engineRef = useRef<GameEngine | null>(null);
  const titleTapCountRef = useRef(0);
  const titleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { auth, logout, updateProfile } = useAuth();
  const { data: publicProfile, isFetching: isRankLoading, isError: rankError, refetch: retryRank } = usePublicProfile(auth?.profile.id);
  const rankUnavailable = !!auth && (!publicProfile || isRankLoading);
  const questPreview = auth
    ? (publicProfile ? getRankQuests(publicProfile.rank, questRotation) : null)
    : getRankQuests(null, questRotation);
  const { toast } = useToast();
  const race = useRace(auth?.token);
  const raceRef = useRef(race);
  const raceActiveRef = useRef(false);
  useEffect(() => { raceRef.current = race; }, [race]);
  useEffect(() => { raceActiveRef.current = raceActive; }, [raceActive]);

  useEffect(() => {
    if (gameState !== 'PLAYING' || raceActive || !questRun.quests.length) return;
    const updateQuestProgress = () => {
      if (raceActiveRef.current) return;
      const stats = engineRef.current?.getLiveStats();
      if (stats) questRun.report(stats);
    };
    updateQuestProgress();
    const timer = window.setInterval(updateQuestProgress, 200);
    return () => window.clearInterval(timer);
  }, [questRun.quests, questRun.report, gameState, raceActive]);

  const toggleLoadout = (key: string) =>
    setLoadout(prev => ({ ...prev, [key]: !prev[key] }));

  // Always-current refs so engine callbacks are never stale
  const authRef = useRef(auth);
  const updateProfileRef = useRef(updateProfile);
  useEffect(() => { authRef.current = auth; }, [auth]);
  useEffect(() => { updateProfileRef.current = updateProfile; }, [updateProfile]);

  useEffect(() => {
    const skin = SKINS.find(item => item.id === auth?.profile.equippedSkin) ?? SKINS[0];
    engineRef.current?.setPlayerSkin(skin.color, skin.accent, skin.animated, skin.id);
  }, [auth?.profile.equippedSkin]);


  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 1280;
    canvas.height = 720;

    const engine = new GameEngine(canvas, {
      onStartRequested: () => startRequestRef.current(),
      onGameOver: (stats) => {
        if (!raceActiveRef.current) questRunRef.current.report(engine.getLiveStats());
        setFinalStats(stats);
        setGameState('GAMEOVER');
        setRevivePrompt(null);
        if (raceActiveRef.current) {
          raceRef.current.sendDead(stats.distance, Math.floor(stats.cudaCores));
          setShowRaceResults(true);
        }
      },
      onProgress: (distance, cudaCores) => {
        if (raceActiveRef.current) raceRef.current.sendProgress(distance, cudaCores);
      },
      onRaceFinished: (stats) => {
        setFinalStats(stats);
        setGameState('GAMEOVER');
        setRevivePrompt(null);
        raceRef.current.sendProgress(stats.distance, Math.floor(stats.cudaCores));
        setShowRaceResults(true);
      },
      onRaceLifeLost: (distance, cudaCores) => {
        if (raceActiveRef.current) raceRef.current.sendHit(distance, cudaCores);
      },
      onPcBuildDrafted: () => {
        if (!raceActiveRef.current) setShowPcBuild(true);
      },
      onReviveAvailable: (useRevive, decline) => {
        setRevivePrompt({
          accept: () => {
            // Use refs so we always have current auth
            const token = authRef.current?.token;
            if (token) {
              fetch('/api/user/use-revive', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              }).then(r => r.json()).then(d => updateProfileRef.current(d.profile)).catch(() => {});
            }
            setRevivesLeft(prev => Math.max(0, prev - 1));
            setRevivePrompt(null);
            useRevive();
          },
          decline: () => {
            setRevivePrompt(null);
            decline();
          },
        });
      },
    });

    engineRef.current = engine;
    return () => { engine.destroy(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = useCallback(() => {
    if (!engineRef.current) return;
    if (rankUnavailable) {
      toast({ title: "RANK NOT READY", description: rankError ? "Couldn't load your rank. Retry from the quest board." : "Your rank is still loading. Try again in a moment." });
      return;
    }

    raceActiveRef.current = false;
    setRaceActive(false);
    setShowRaceResults(false);
    questRun.begin(getRankQuests(auth ? publicProfile?.rank : null, questRotation));
    setQuestRotation(rotation => (rotation + 1) % 12);
    setFinalStats(null);
    const profile = auth?.profile;
    const skin = SKINS.find(item => item.id === profile?.equippedSkin) ?? SKINS[0];
    engineRef.current.setPlayerSkin(skin.color, skin.accent, skin.animated, skin.id);
    const revives       = profile?.revives ?? 0;
    const hasHeadStart  = loadout.headStart  && (profile?.headStarts  ?? 0) > 0;
    const hasOverclock  = loadout.overclock  && (profile?.overclocks  ?? 0) > 0;
    const luckyCharm    = loadout.luckyCharm && (profile?.luckyCharms ?? 0) > 0;
    const hasSprint     = loadout.sprint     && (profile?.sprintBoosts ?? 0) > 0;
    const coreDoubler   = loadout.coreDoubler && (profile?.coreDoublers ?? 0) > 0;
    const hasGhost      = loadout.ghost      && (profile?.ghostBoosts  ?? 0) > 0;
    const hdTier        = loadout.hardDrive  ? (profile?.hardDriveTier ?? 0) : 0;

    setRevivesLeft(revives);

    // Consume start-of-run items from DB (fire & forget)
    if (auth?.token && profile && (hasHeadStart || hasOverclock || luckyCharm || hasSprint || coreDoubler || hasGhost)) {
      fetch('/api/user/consume-start-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ headStart: hasHeadStart, overclock: hasOverclock, luckyCharm, sprint: hasSprint, coreDoubler, ghost: hasGhost }),
      }).then(r => r.json()).then(d => updateProfile(d.profile)).catch(() => {});
    }

    engineRef.current.startGame({
      revives,
      hasHeadStart,
      hasOverclock,
      luckyCharm,
      hasSprint,
      coreDoubler,
      hardDriveTier: hdTier,
      hasGhost,
      lotusCheckpoint: profile?.lotusCheckpoint ?? null,
    });
    setGameState('PLAYING');
    setRevivePrompt(null);
  }, [auth, updateProfile, loadout, publicProfile?.rank, rankUnavailable, rankError, toast, questRun.begin, questRotation]);
  startRequestRef.current = () => {
    if (gameState === 'START' && !showRaceLobby && !showAdmin && !showShop && !showAuth && !showAccount && !showDeveloperUnlock) startGame();
  };

  const handleProfileUpdate = useCallback((p: UserProfile) => {
    updateProfile(p);
  }, [updateProfile]);

  const completePcBuild = useCallback((success: boolean, elapsedSeconds: number) => {
    setShowPcBuild(false);
    engineRef.current?.resolvePcBuild(success, elapsedSeconds);
    if (success) {
      toast({
        title: elapsedSeconds < 55 ? "STAR EMPLOYEE!" : "PC BUILD COMPLETE",
        description: elapsedSeconds < 55
          ? "Badge earned. CUDA cores are doubled for 1 minute."
          : "CUDA cores are doubled for 1 minute.",
      });
    } else {
      toast({
        title: "WORK ORDER FAILED",
        description: "Running speed is reduced for 1 minute.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // ── Multiplayer race ──────────────────────────────
  const openRaceLobby = useCallback(() => {
    if (!auth) { setShowAuth(true); return; }
    setShowRaceLobby(true);
  }, [auth]);

  const startRaceRun = useCallback((room: RaceRoomState) => {
    if (!engineRef.current) return;
    const skin = SKINS.find(item => item.id === auth?.profile.equippedSkin) ?? SKINS[0];
    engineRef.current.setPlayerSkin(skin.color, skin.accent, skin.animated, skin.id);
    setShowRaceLobby(false);
    setShowAdmin(false);
    setShowDeveloperUnlock(false);
    setDeveloperSpeedMultiplier(1);
    setDeveloperInvincible(false);
    engineRef.current.setDeveloperSpeedMultiplier(1);
    engineRef.current.setDeveloperInvincible(false);
    setShowRaceResults(false);
    questRun.clear();
    setRaceActive(true);
    raceActiveRef.current = true;
    setRevivesLeft(0);
    setRevivePrompt(null);
    setFinalStats(null);
    // Races are a level playing field: no revives, consumables, hard-drive speed or Lotus checkpoints.
    engineRef.current.startGame({
      revives: 0,
      hasHeadStart: false,
      hasOverclock: false,
      luckyCharm: false,
      hasSprint: false,
      coreDoubler: false,
      hardDriveTier: 0,
      hasGhost: false,
      lotusCheckpoint: null,
      raceTargetDistance: room.targetDistance,
      raceMode: true,
      pcBuildEnabled: false,
    });
    setGameState('PLAYING');
  }, [auth?.profile.equippedSkin, questRun.clear]);

  const leaveRaceEntirely = useCallback(() => {
    race.leaveRoom();
    engineRef.current?.exitGame();
    setRaceActive(false);
    setShowRaceResults(false);
    setShowRaceLobby(false);
    setRevivePrompt(null);
    setFinalStats(null);
    setGameState('START');
  }, [race]);

  const backToRaceLobby = useCallback(() => {
    if (race.me?.isHost) race.rematch();
    engineRef.current?.exitGame();
    setRaceActive(false);
    setShowRaceResults(false);
    setFinalStats(null);
    setGameState('START');
    setShowRaceLobby(true);
  }, [race]);

  // If the host resets the room (rematch) while we're still on results, follow them back to the lobby.
  useEffect(() => {
    if (raceActive && showRaceResults && race.room?.status === 'lobby') {
      engineRef.current?.exitGame();
      setRaceActive(false);
      setShowRaceResults(false);
      setFinalStats(null);
      setGameState('START');
      setShowRaceLobby(true);
    }
  }, [race.room?.status, raceActive, showRaceResults]);

  // Lost the room mid-race (disconnect / kicked): fall back to the start menu.
  useEffect(() => {
    if (raceActive && !race.room) {
      engineRef.current?.exitGame();
      setRaceActive(false);
      setShowRaceResults(false);
      setFinalStats(null);
      setGameState('START');
      toast({ title: "RACE DISCONNECTED", description: "Lost connection to the race room.", variant: "destructive" });
    }
  }, [race.room, raceActive, toast]);

  // ── Runbun & the rare CD ──────────────────────────
  const giftCdToRunbun = useCallback(async () => {
    if (!auth?.token || giftingCd) return;
    setGiftingCd(true);
    try {
      const res = await fetch('/api/user/gift-runbun', { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } });
      const data = await res.json();
      if (!res.ok) {
        if (data.profile) updateProfile(data.profile);
        toast({ title: "RUNBUN LOOKS AWAY", description: data.message ?? "Runbun didn't take it.", variant: "destructive" });
        return;
      }
      updateProfile(data.profile);
      if (data.firstGift) {
        toast({
          title: "[REDACTED] UNLOCKED",
          description: "Runbun purrs. A secret badge and a strange shirt appeared in your account. Check Jeff's Shop → SKINS.",
        });
      } else {
        toast({ title: "RUNBUN PURRS", description: "Runbun adds the CD to the pile." });
      }
    } catch {
      toast({ title: "RUNBUN LOOKS AWAY", description: "Could not reach Runbun.", variant: "destructive" });
    } finally {
      setGiftingCd(false);
    }
  }, [auth?.token, giftingCd, updateProfile, toast]);

  const isAdmin = auth?.profile?.role === "admin" || auth?.profile?.role === "ultra_admin" || auth?.profile?.role === "super_admin";
  const isUltraAdmin = auth?.profile?.role === "ultra_admin" || auth?.profile?.role === "super_admin";

  const handleTitleTap = useCallback(() => {
    titleTapCountRef.current += 1;
    if (titleTapTimerRef.current) clearTimeout(titleTapTimerRef.current);
    if (titleTapCountRef.current >= 3) {
      titleTapCountRef.current = 0;
      setDeveloperCode("");
      setDeveloperUnlockError("");
      setShowDeveloperUnlock(true);
      return;
    }
    titleTapTimerRef.current = setTimeout(() => {
      titleTapCountRef.current = 0;
    }, 1800);
  }, []);

  const unlockDeveloperAccess = useCallback(async () => {
    if (!auth?.token) {
      setDeveloperUnlockError("Log in first. Developer access is account-bound.");
      return;
    }
    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ code: developerCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unlock failed");
      updateProfile(data.profile);
      setShowDeveloperUnlock(false);
      setDeveloperCode("");
      if (!raceActiveRef.current) setShowAdmin(true);
      const isUltra = data.profile?.role === "ultra_admin" || data.profile?.role === "super_admin";
      toast({
        title: isUltra ? "ULTRA ADMIN ACTIVATED!" : "DEVELOPER ACCESS UNLOCKED",
        description: isUltra
          ? "Ultra spawner, live booster injector & full account controls unlocked!"
          : "Owner controls are now available.",
      });
    } catch (error: any) {
      setDeveloperUnlockError(error.message);
    }
  }, [auth, developerCode, toast, updateProfile]);

  const setLiveSpeed = useCallback((value: number) => {
    setDeveloperSpeedMultiplier(value);
    engineRef.current?.setDeveloperSpeedMultiplier(value);
  }, []);

  const setLiveInvincibility = useCallback((value: boolean) => {
    setDeveloperInvincible(value);
    engineRef.current?.setDeveloperInvincible(value);
  }, []);

  const handleSpawnInFront = useCallback((type: 'booster' | 'supernova' | 'megaboost' | 'jetsurge' | 'magnet' | 'jumpboost' | 'scarletrush' | 'cookie' | 'cores' | 'flop') => {
    engineRef.current?.spawnInFront(type);
    toast({ title: "SPAWNED!", description: `Injected ${type.toUpperCase()} right in front of runner!` });
  }, [toast]);

  const handleNukeObstacles = useCallback(() => {
    engineRef.current?.nukeObstacles();
    toast({ title: "NUKE DETONATED!", description: "All active obstacles on screen vaporized!" });
  }, [toast]);

  const openShop = useCallback(() => {
    if (gameState === 'PLAYING') engineRef.current?.pause();
    setShowShop(true);
  }, [gameState]);

  const closeShop = useCallback(() => {
    setShowShop(false);
    if (gameState === 'PLAYING') engineRef.current?.resume();
  }, [gameState]);

  const placeLotus = useCallback(async () => {
    const token = auth?.token;
    const engine = engineRef.current;
    if (!token || !engine || gameState !== 'PLAYING' || !auth.profile.lotuses || auth.profile.lotusCheckpoint) return;

    const checkpoint = engine.captureLotusCheckpoint();
    engine.setLotusCheckpoint(checkpoint);
    try {
      const res = await fetch('/api/user/place-lotus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(checkpoint),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to plant Lotus');
      updateProfile(data.profile);
      toast({ title: "LOTUS PLANTED", description: `Checkpoint saved at ${Math.floor(checkpoint.distance)}m.` });
    } catch (error: any) {
      engine.setLotusCheckpoint(null);
      toast({ title: "Lotus failed to take root", description: error.message, variant: "destructive" });
    }
  }, [auth, gameState, toast, updateProfile]);

  const useLotus = useCallback(async () => {
    const token = auth?.token;
    const checkpoint = auth?.profile.lotusCheckpoint;
    const engine = engineRef.current;
    if (!token || !checkpoint || !engine) return;
    if (raceActiveRef.current) return;
    if (!questRunRef.current.quests.length && rankUnavailable) {
      toast({ title: "RANK NOT READY", description: "Load your rank before starting a checkpoint quest run." });
      return;
    }

    try {
      const res = await fetch('/api/user/use-lotus', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to use Lotus');
      updateProfile(data.profile);
      if (!questRunRef.current.quests.length) {
        questRun.begin(getRankQuests(publicProfile?.rank, questRotation));
        setQuestRotation(rotation => (rotation + 1) % 12);
      }
      engine.respawnAtLotus(checkpoint);
      setFinalStats(null);
      setRevivePrompt(null);
      setGameState('PLAYING');
      closeShop();
      toast({ title: "RESPAWNED AT LOTUS", description: `Back to ${Math.floor(checkpoint.distance)}m.` });
    } catch (error: any) {
      toast({ title: "Lotus respawn failed", description: error.message, variant: "destructive" });
    }
  }, [auth, closeShop, toast, updateProfile, rankUnavailable, publicProfile?.rank, questRotation, questRun.begin]);

  const openAdmin = useCallback(() => {
    if (raceActiveRef.current) return;
    if (gameState === 'PLAYING') engineRef.current?.pause();
    setShowAdmin(true);
  }, [gameState]);

  const closeAdmin = useCallback(() => {
    setShowAdmin(false);
    if (gameState === 'PLAYING') engineRef.current?.resume();
  }, [gameState]);

  const exitRun = useCallback(() => {
    if (raceActiveRef.current) {
      const live = engineRef.current?.getLiveStats();
      if (live) raceRef.current.sendDead(live.distance, live.cudaCores);
      raceRef.current.leaveRoom();
      setRaceActive(false);
      setShowRaceResults(false);
    }
    engineRef.current?.exitGame();
    questRunRef.current.clear();
    setShowShop(false);
    setShowAdmin(false);
    setShowPcBuild(false);
    setRevivePrompt(null);
    setFinalStats(null);
    setGameState('START');
  }, []);

  return (
    <div className="scanlines">
      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-50 bg-background overflow-y-auto flex flex-col items-center"
          >
            {/* Ambient background */}
            <div className="pointer-events-none fixed inset-0 z-0">
              <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/8 to-transparent" />
              <div className="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-secondary/8 to-transparent" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,hsl(var(--primary)/0.05),transparent)]" />
            </div>

            {/* Top ticker */}
            <div className="w-full overflow-hidden bg-primary/8 border-b-2 border-primary/30 py-1.5 flex-shrink-0 relative z-10">
              <div className="ticker-inner font-arcade text-xs text-primary/60 tracking-widest">{TICKER_TEXT}</div>
            </div>

            {/* Main content */}
            <div className="relative z-10 flex flex-col items-center text-center px-6 pt-14 pb-20 w-full max-w-5xl mx-auto">

              {/* Auth bar */}
              <div className="w-full flex justify-end items-center gap-3 mb-6">
                {auth ? (
                  <>
                    <button
                      onClick={() => setShowAccount(true)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-card/30 border border-border/40 hover:border-secondary/60 transition-colors"
                      title="Open account"
                    >
                      <User className="w-3 h-3 text-secondary" />
                      <span className="font-arcade text-[10px] text-secondary">{auth.profile.username}</span>
                      <Award className="w-3 h-3 text-accent/70" />
                    </button>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30">
                      <Coins className="w-3 h-3 text-yellow-400" />
                      <span className="font-arcade text-[10px] text-yellow-300">{auth.profile.cudaCoins}</span>
                    </div>
                    {auth.profile.revives > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/30">
                        <Heart className="w-3 h-3 text-green-400" />
                        <span className="font-arcade text-[10px] text-green-300">{auth.profile.revives}</span>
                      </div>
                    )}
                    <button
                      onClick={openShop}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/40 border border-amber-600/40 hover:bg-amber-800/50 transition-colors font-arcade text-[10px] text-yellow-300"
                    >
                      <ShoppingBag className="w-3 h-3" /> SHOP
                    </button>
                    <button
                      onClick={() => logout()}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border/40 hover:border-primary/40 transition-colors font-arcade text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <LogOut className="w-3 h-3" /> LOGOUT
                    </button>
                    {isAdmin && (
                      <button
                        onClick={openAdmin}
                        className={`flex items-center gap-1.5 px-3 py-1.5 border transition-all font-arcade text-[10px] ${
                          isUltraAdmin
                            ? 'border-yellow-500/80 bg-red-950/40 text-yellow-300 shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:bg-red-900/60'
                            : 'border-red-500/40 hover:border-red-500 text-red-400 hover:bg-red-500/10'
                        }`}
                      >
                        <Shield className={`w-3 h-3 ${isUltraAdmin ? 'text-yellow-400 animate-pulse' : 'text-red-400'}`} />
                        {isUltraAdmin ? 'ULTRA ADMIN' : 'ADMIN'}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => setShowAuth(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-secondary/40 hover:border-secondary transition-colors font-arcade text-[10px] text-secondary/80 hover:text-secondary neon-box-cyan"
                  >
                    <LogIn className="w-3 h-3" /> LOG IN / CREATE ACCOUNT
                  </button>
                )}
              </div>

              {/* Jeff's Shop hanging sign */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="self-end mr-4 mb-4 relative"
              >
                {/* Ropes */}
                <div className="absolute -top-8 left-6 w-0.5 h-8 bg-amber-800" />
                <div className="absolute -top-8 right-6 w-0.5 h-8 bg-amber-800" />
                {/* Sign */}
                <button
                  onClick={() => auth ? openShop() : setShowAuth(true)}
                  className="block bg-amber-950 border-4 border-amber-700 px-6 py-3 shadow-xl hover:bg-amber-900 transition-colors group"
                  style={{ boxShadow: "0 4px 20px rgba(180,120,0,0.3), inset 0 1px 0 rgba(255,200,80,0.1)" }}
                >
                  <div className="font-arcade text-base text-yellow-300 tracking-wider group-hover:text-yellow-200 transition-colors"
                    style={{ textShadow: "0 0 12px rgba(255,200,0,0.5)" }}>
                     JEFF'S SHOP
                  </div>
                  <div className="font-tech text-[10px] text-amber-500/70 mt-0.5">
                    {auth ? "[ TAP TO ENTER ]" : "[ LOGIN REQUIRED ]"}
                  </div>
                </button>
              </motion.div>

              {/* Title block */}
              <motion.div
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="pixel-frame pixel-frame-bottom w-full max-w-3xl bg-card/20 px-1 py-7 sm:px-8 sm:py-10 mb-8 cursor-pointer select-none"
                onClick={handleTitleTap}
                role="button"
                tabIndex={0}
                aria-label="Developer access"
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleTitleTap();
                  }
                }}
              >
                <div className="font-tech text-xs text-primary/50 mb-4 tracking-[0.4em]">// SYSTEM BOOT //</div>
                <h1 className="flex w-full justify-center">
                  <img
                    src={warehouseLogo}
                    alt="Jared's Warehouse"
                    className="flicker block h-auto w-[90vw] max-w-[720px] object-contain"
                    draggable={false}
                  />
                </h1>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <div className="h-px w-16 bg-primary/40" />
                  <div className="font-arcade text-xs text-primary/40">VER 4.0</div>
                  <div className="h-px w-16 bg-primary/40" />
                </div>
              </motion.div>

              {/* Subtitle badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="neon-box-cyan px-8 py-2 mb-12 animate-pulse"
              >
                <span className="font-arcade text-xs text-secondary uppercase tracking-[0.35em]">
                  UPDATE 4: MASTERY MAYHEM
                </span>
              </motion.div>

              {/* Section divider */}
              <div className="w-full max-w-xl flex items-center gap-4 mb-8">
                <div className="flex-1 h-px bg-primary/30" />
                <span className="font-arcade text-xs text-primary/50">// MISSION BRIEFING //</span>
                <div className="flex-1 h-px bg-primary/30" />
              </div>

              {/* Description */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="terminal-box max-w-xl w-full mb-10 text-left"
              >
                <p className="font-tech text-base text-muted-foreground leading-relaxed">
                  <span className="text-secondary">$&gt;</span> Collect <span className="text-primary">CUDA cores</span>. Upgrade your hardware.<br />
                  <span className="text-secondary">$&gt;</span> Find <span className="text-purple-400">flops</span> for a permanent multiplier.<br />
                  <span className="text-secondary">$&gt;</span> The <span className="text-yellow-400">Silicon Lottery</span> can strike every 27s.<br />
                  <span className="text-secondary">$&gt;</span> Visit <span className="text-amber-400">Jeff's Shop</span> to spend CUDA coins.<span className="blink text-secondary ml-1">_</span>
                </p>
                <p className="mt-4 font-arcade text-xs text-secondary/60 tracking-widest">
                  PRESS SPACE OR CLICK TO JUMP
                </p>
              </motion.div>

              {/* Loadout toggle panel */}
              {auth && (() => {
                const p = auth.profile;
                const hdInfo = p.hardDriveTier > 0 ? HARD_DRIVE_TIERS.find(t => t.tier === p.hardDriveTier) : null;
                const allItems = [
                  { key: 'headStart',   label: 'HEAD START',   count: p.headStarts,   color: 'text-orange-400',  bg: 'border-orange-500/30 bg-orange-500/5'  },
                  { key: 'overclock',   label: 'OVERCLOCK',    count: p.overclocks,   color: 'text-purple-400',  bg: 'border-purple-500/30 bg-purple-500/5'  },
                  { key: 'luckyCharm',  label: 'LUCKY CHARM',  count: p.luckyCharms,  color: 'text-yellow-400',  bg: 'border-yellow-500/30 bg-yellow-500/5'  },
                  { key: 'sprint',      label: 'SPRINT',       count: p.sprintBoosts, color: 'text-red-400',     bg: 'border-red-500/30 bg-red-500/5'        },
                  { key: 'coreDoubler', label: '2× CORES',     count: p.coreDoublers, color: 'text-cyan-400',    bg: 'border-cyan-500/30 bg-cyan-500/5'      },
                  { key: 'ghost',       label: 'GHOST',        count: p.ghostBoosts,  color: 'text-teal-400',    bg: 'border-teal-500/30 bg-teal-500/5'      },
                ].filter(i => i.count > 0);
                if (allItems.length === 0 && !hdInfo) return null;
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="max-w-xl w-full mb-8 border border-green-500/20 bg-green-500/3"
                  >
                    <div className="px-4 py-2 border-b border-green-500/20 flex items-center justify-between">
                      <span className="font-arcade text-[9px] text-green-400 tracking-widest">LOADOUT — CLICK TO TOGGLE</span>
                      <span className="font-tech text-[10px] text-muted-foreground/50">ON = used this run</span>
                    </div>
                    <div className="px-4 py-3 flex gap-2 flex-wrap">
                      {hdInfo && (
                        <button
                          onClick={() => toggleLoadout('hardDrive')}
                          className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-arcade transition-all ${
                            loadout.hardDrive
                              ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                              : 'border-muted/30 bg-muted/5 text-muted-foreground/40 line-through'
                          }`}
                          style={{ borderColor: loadout.hardDrive ? hdInfo.color + '80' : undefined, color: loadout.hardDrive ? hdInfo.color : undefined }}
                        >
                          <HardDrive className="w-3 h-3" />
                          HDD: {hdInfo.name} +{Math.round(hdInfo.speedBonus * 100)}%
                        </button>
                      )}
                      {allItems.map(item => (
                        <button
                          key={item.key}
                          onClick={() => toggleLoadout(item.key)}
                          className={`px-3 py-1.5 border text-xs font-arcade transition-all ${
                            loadout[item.key]
                              ? `${item.bg} ${item.color}`
                              : 'border-muted/30 bg-muted/5 text-muted-foreground/40 line-through'
                          }`}
                        >
                          {item.label} ×{item.count}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                );
              })()}

              {/* CTA Button */}
              <div className="w-full max-w-3xl mb-6 text-left">
                {questPreview ? (
                  <RankQuestBoard quests={questPreview} mode="preview" onShuffle={() => setQuestRotation(rotation => (rotation + 1) % 12)} />
                ) : (
                  <div className="border-2 border-primary/35 bg-primary/5 p-4 text-center pixel-frame">
                    <div className="font-arcade text-[9px] text-primary tracking-widest">{rankError ? "BETA QUESTS: RANK UNAVAILABLE" : "CALIBRATING BETA QUESTS..."}</div>
                    <p className="mt-2 font-tech text-xs text-muted-foreground">{rankError ? "We couldn't load your rank. Retry to get the right challenges." : "LOADING YOUR CURRENT RANK"}</p>
                    {rankError && <button type="button" onClick={() => retryRank()} className="mt-3 border border-secondary text-secondary px-4 py-3 font-tech text-sm">RETRY RANK</button>}
                  </div>
                )}
              </div>
              <motion.button
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4 }}
                onClick={startGame}
                disabled={rankUnavailable}
                className="arcade-btn-pulse bg-primary text-primary-foreground font-arcade text-xl py-6 px-14 hover:bg-primary/90 transition-colors mb-3 arcade-shadow-hover arcade-shadow-active disabled:opacity-45 disabled:cursor-wait"
              >
                START DASH
              </motion.button>
              <p className="font-tech text-xs text-muted-foreground mb-6 tracking-widest">
                [ SPACE &nbsp;/&nbsp; CLICK &nbsp;/&nbsp; TAP ]
              </p>
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                onClick={openRaceLobby}
                className="mb-16 neon-box-cyan bg-background/70 border-2 border-secondary/60 text-secondary font-arcade text-xs py-4 px-8 flex items-center gap-3 hover:bg-secondary/10 transition-colors tracking-widest"
                data-testid="button-multiplayer-race"
              >
                <Users className="w-4 h-4" /> MULTIPLAYER RACE
                <span className="font-tech text-[10px] text-secondary/60 normal-case tracking-normal">{auth ? "create or join a room" : "log in to race"}</span>
              </motion.button>

              {/* Leaderboard */}
              <div className="w-full max-w-2xl flex items-center gap-4 mb-8">
                <div className="flex-1 h-px bg-accent/40" />
                <span className="font-arcade text-xs text-accent/70">// HALL OF FAME //</span>
                <div className="flex-1 h-px bg-accent/40" />
              </div>
              <div className="w-full max-w-2xl">
                <Leaderboard />
              </div>

              <p className="mt-14 font-tech text-muted-foreground/50 text-xs tracking-widest">
                BEST PLAYED ON DESKTOP &nbsp;&middot;&nbsp; TAP TO JUMP ON MOBILE
              </p>

              {/* Runbun */}
              <motion.button
                type="button"
                onClick={() => setRunbunPetCount(c => c + 1)}
                whileTap={{ scale: 0.95, y: 2 }}
                className="mt-8 flex flex-col items-center gap-2 group"
              >
                <div className="text-xs font-arcade text-secondary/50 tracking-[0.35em]">RUNBUN</div>
                <div className="pixel-frame bg-background/40 p-3 neon-box-cyan">
                  <img
                    src={(auth?.profile.runbunGifted ?? 0) > 0 ? runbunWithCd : runbunWithoutCd}
                    alt={(auth?.profile.runbunGifted ?? 0) > 0 ? "Runbun with a CD" : "Runbun"}
                    className="h-36 w-36 select-none object-contain transition-transform duration-200 group-hover:scale-105 sm:h-40 sm:w-40"
                    style={{ imageRendering: "pixelated" }}
                    draggable={false}
                  />
                </div>
                <div className="font-tech text-xs text-muted-foreground/70">
                  {runbunPetCount === 0 ? "tap to pet" : `pets: ${runbunPetCount}`}
                </div>
              </motion.button>
              {auth && auth.profile.rareCds > 0 && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={giftCdToRunbun}
                  disabled={giftingCd}
                  className="mt-3 flex items-center gap-2 border-2 border-white/60 bg-white/5 px-4 py-2 font-arcade text-[9px] text-white tracking-widest hover:bg-white/15 disabled:opacity-50 transition-colors"
                  style={{ boxShadow: "0 0 18px rgba(255,255,255,0.25)" }}
                  data-testid="button-gift-runbun"
                >
                  <Disc3 className="w-4 h-4 animate-spin" style={{ animationDuration: '3s' }} />
                  {giftingCd ? "RUNBUN IS SNIFFING IT..." : `GIVE RARE CD TO RUNBUN (×${auth.profile.rareCds})`}
                </motion.button>
              )}
            </div>

            {/* Bottom ticker */}
            <div className="w-full overflow-hidden bg-secondary/5 border-t-2 border-secondary/20 py-1 flex-shrink-0 relative z-10 mt-auto">
              <div className="ticker-inner font-arcade text-xs text-secondary/40 tracking-widest" style={{ animationDirection: 'reverse' }}>
                {TICKER_TEXT}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game canvas */}
      <div className="relative w-full min-h-screen bg-background flex flex-col items-center justify-center overflow-hidden">
        <div className="relative w-full max-w-[1280px] aspect-video border-4 border-border arcade-shadow bg-black mx-auto">
          <canvas
            ref={canvasRef}
            className="w-full h-full pixel-rendering cursor-pointer"
            style={{ display: 'block' }}
          />

          {/* In-game admin button (only visible for admins) */}
          {isAdmin && gameState === 'PLAYING' && !raceActive && (
            <button
              onClick={openAdmin}
              className={`absolute top-3 right-24 z-30 px-2 py-1 border font-arcade text-[8px] tracking-widest transition-colors ${
                isUltraAdmin
                  ? 'border-yellow-500/80 bg-red-950/70 text-yellow-300 hover:bg-red-900 shadow-[0_0_10px_rgba(255,215,0,0.4)]'
                  : 'border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 opacity-60 hover:opacity-100'
              }`}
            >
              {isUltraAdmin ? '⚡ ULTRA ADMIN' : 'ADMIN'}
            </button>
          )}


          {gameState === 'PLAYING' && (
            <button
              onClick={exitRun}
              className="absolute top-3 right-3 z-30 px-2 py-1 flex items-center gap-1.5 border border-destructive/50 bg-background/80 text-destructive hover:bg-destructive/10 hover:border-destructive font-arcade text-[8px] tracking-widest transition-colors"
            >
              <DoorOpen className="w-3 h-3" /> EXIT RUN
            </button>
          )}

          {/* Revive prompt overlay */}
          <AnimatePresence>
            {revivePrompt && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-background/75 backdrop-blur-sm flex items-center justify-center z-40"
              >
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="bg-background border-2 border-green-500/60 px-8 py-6 text-center pixel-frame max-w-xs"
                  style={{ boxShadow: "0 0 30px rgba(0,255,100,0.2)" }}
                >
                  <Heart className="w-10 h-10 text-green-400 mx-auto mb-3 animate-pulse" />
                  <h3 className="font-arcade text-sm text-green-300 mb-2">USE REVIVE?</h3>
                  <p className="font-tech text-xs text-muted-foreground mb-4">
                    {revivesLeft} revive{revivesLeft !== 1 ? 's' : ''} remaining
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={revivePrompt.accept}
                      className="flex-1 py-3 bg-green-600 text-white font-arcade text-xs hover:bg-green-500 transition-colors"
                    >
                      YES
                    </button>
                    <button
                      onClick={revivePrompt.decline}
                      className="flex-1 py-3 border border-destructive/60 text-destructive font-arcade text-xs hover:bg-destructive/10 transition-colors"
                    >
                      NO
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {gameState === 'GAMEOVER' && finalStats && !raceActive && (
            <GameOverModal
              stats={finalStats}
              onRestart={startGame}
              auth={auth}
              onProfileUpdate={handleProfileUpdate}
              quests={questRun.quests}
              questProgress={questRun.progress}
            />
          )}

          {raceActive && showRaceResults && race.room && auth && (
            <RaceResults
              room={race.room}
              meId={auth.profile.id}
              onBackToLobby={backToRaceLobby}
              onExit={leaveRaceEntirely}
            />
          )}
        </div>

        {/* Multiplayer scores live below the canvas so they never obscure the race. */}
        {raceActive && gameState === 'PLAYING' && race.room && auth && (
          <div className="w-full max-w-[1280px] px-3 py-3 bg-background">
            <RaceHud room={race.room} meId={auth.profile.id} />
          </div>
        )}

        {gameState === 'PLAYING' && !raceActive && questRun.quests.length > 0 && (
          <div className="w-full max-w-[1280px] px-3 pt-3 bg-background">
            <RankQuestBoard quests={questRun.quests} progress={questRun.progress} mode="live" />
          </div>
        )}

        {/* Keep the checkpoint control outside the canvas so it never covers Jared or gameplay. */}
        {auth && gameState === 'PLAYING' && !raceActive && (
          <div className="w-full max-w-[1280px] px-3 py-3 flex justify-start bg-background">
            <button
              onClick={placeLotus}
              disabled={!auth.profile.lotuses || !!auth.profile.lotusCheckpoint}
              title={
                auth.profile.lotusCheckpoint
                  ? "A Lotus checkpoint is already planted"
                  : !auth.profile.lotuses
                    ? "Buy a Lotus from Jeff's Shop"
                    : "Plant a Lotus checkpoint here"
              }
              className="px-3 py-2 flex items-center gap-1.5 border border-green-400/60 bg-background text-green-200 hover:bg-green-400/10 hover:border-green-300 disabled:opacity-45 disabled:hover:bg-transparent disabled:cursor-not-allowed font-arcade text-[8px] tracking-widest transition-colors"
              data-testid="button-plant-lotus"
            >
              <Flower2 className="w-3 h-3" />
              {auth.profile.lotusCheckpoint ? "LOTUS PLANTED" : "PLANT LOTUS"}
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showPcBuild && <PcBuildMinigame onComplete={completePcBuild} />}
      </AnimatePresence>
      <AnimatePresence>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showRaceLobby && auth && (
          <RaceLobby
            token={auth.token}
            race={race}
            onClose={() => setShowRaceLobby(false)}
            onRaceStart={startRaceRun}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAccount && auth && (
          <AccountPanel profile={auth.profile} onClose={() => setShowAccount(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showShop && auth && (
          <BobsShop
            profile={auth.profile}
            token={auth.token}
            onClose={closeShop}
            onProfileUpdate={handleProfileUpdate}
            gameState={gameState}
            onPlaceLotus={placeLotus}
            onUseLotus={useLotus}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAdmin && auth && !raceActive && (
          <AdminPanel
            onClose={closeAdmin}
            token={auth.token}
            speedMultiplier={developerSpeedMultiplier}
            invincible={developerInvincible}
            onSpeedMultiplierChange={setLiveSpeed}
            onInvincibleChange={setLiveInvincibility}
            currentProfile={auth.profile}
            onProfileUpdate={updateProfile}
            onSpawnInFront={handleSpawnInFront}
            onNukeObstacles={handleNukeObstacles}
            initialTab={gameState === 'PLAYING' ? 'spawner' : 'users'}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showDeveloperUnlock && !raceActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] bg-black/90 flex items-center justify-center p-4"
            onClick={(event) => { if (event.target === event.currentTarget) setShowDeveloperUnlock(false); }}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-background border-2 border-red-500/50 p-6"
              style={{ boxShadow: "0 0 45px rgba(255,0,0,0.18)" }}
            >
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-5 h-5 text-red-400" />
                <h2 className="font-arcade text-sm text-red-300 tracking-widest">DEVELOPER ACCESS</h2>
              </div>
              <p className="font-tech text-xs text-red-500/60 leading-relaxed mb-5">
                Restricted owner controls. Enter the developer code to unlock account editing and live round overrides.
              </p>
              <input
                autoFocus
                type="password"
                value={developerCode}
                onChange={(event) => { setDeveloperCode(event.target.value); setDeveloperUnlockError(""); }}
                onKeyDown={(event) => { if (event.key === "Enter") unlockDeveloperAccess(); }}
                placeholder="Enter access code..."
                className="w-full bg-black border border-red-500/40 px-3 py-3 font-tech text-sm text-red-200 placeholder:text-red-800 focus:outline-none focus:border-red-400"
              />
              {developerUnlockError && (
                <p className="mt-2 font-tech text-xs text-red-400">{developerUnlockError}</p>
              )}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowDeveloperUnlock(false)}
                  className="flex-1 py-3 border border-red-500/30 text-red-500/70 font-arcade text-[10px] tracking-widest hover:text-red-300"
                >
                  CANCEL
                </button>
                <button
                  onClick={unlockDeveloperAccess}
                  disabled={!developerCode.trim()}
                  className="flex-1 py-3 bg-red-700/80 text-white font-arcade text-[10px] tracking-widest hover:bg-red-600 disabled:opacity-30"
                >
                  UNLOCK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
