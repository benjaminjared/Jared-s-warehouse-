import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag, Coins, RefreshCw, Zap, Star, Bolt, HardDrive, ChevronRight, ArrowUpCircle, Wind, HelpCircle, Cpu, Ghost, Flower2, RotateCcw, Palette, Check, Box, Sparkles, Gift } from "lucide-react";
import { SHOP_ITEMS, SKINS, HARD_DRIVE_TIERS, HD_MAX_TIER, CPU_TIERS, CPU_MAX_TIER, CPU_CLAIM_HOURS, CASE_COST, CASE_DUPLICATE_REFUND, CASE_RARITY_ODDS, type SkinRarity, type SkinId } from "@shared/schema";
import { useBuyItem, useBuySkin, useEquipSkin, useUpgradeHardDrive, useUpgradeCpu, useClaimCpuCoins, useRedeemCode, useOpenCase } from "@/hooks/use-shop";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from "@shared/schema";

const ITEM_ICONS: Record<string, any> = {
  revive:      RefreshCw,
  headstart:   Zap,
  luckycharm:  Star,
  overclock:   Bolt,
  sprint:      Wind,
  coredoubler: Coins,
  ghost:       Ghost,
  lotus:       Flower2,
};

const ITEM_COLORS: Record<string, string> = {
  revive:      "text-green-400  border-green-500/40  bg-green-500/5",
  headstart:   "text-orange-400 border-orange-500/40 bg-orange-500/5",
  luckycharm:  "text-yellow-400 border-yellow-500/40 bg-yellow-500/5",
  overclock:   "text-purple-400 border-purple-500/40 bg-purple-500/5",
  sprint:      "text-red-400    border-red-500/40    bg-red-500/5",
  coredoubler: "text-cyan-400   border-cyan-500/40   bg-cyan-500/5",
  ghost:       "text-teal-400   border-teal-500/40   bg-teal-500/5",
  lotus:       "text-pink-400   border-pink-500/40   bg-pink-500/5",
};

const TIER_BG: Record<number, string> = {
  1: "bg-gray-500/10   border-gray-400/30",
  2: "bg-emerald-500/10 border-emerald-400/40",
  3: "bg-blue-500/10   border-blue-400/40",
  4: "bg-purple-500/10  border-purple-400/40",
  5: "bg-yellow-500/10  border-yellow-400/40",
  6: "bg-orange-500/10  border-orange-400/40",
};

const RARITY_BADGES: Record<SkinRarity, { label: string; text: string; border: string; bg: string }> = {
  common:    { label: "COMMON", text: "text-slate-300", border: "border-slate-500/50", bg: "bg-slate-500/10" },
  rare:      { label: "RARE", text: "text-cyan-400", border: "border-cyan-500/50", bg: "bg-cyan-500/10" },
  epic:      { label: "EPIC", text: "text-purple-400", border: "border-purple-500/50", bg: "bg-purple-500/10" },
  legendary: { label: "LEGENDARY", text: "text-amber-300", border: "border-amber-400/80", bg: "bg-gradient-to-r from-amber-500/20 via-pink-500/20 to-cyan-500/20" },
  super:     { label: "SUPER ★", text: "text-red-400", border: "border-red-500/90", bg: "bg-gradient-to-r from-red-600/30 via-yellow-500/30 to-purple-600/30" },
};

function getSkinShirtClass(skinId: string): string {
  if (skinId === "super_nova_prime") return "super-nova-shirt";
  if (skinId === "singularity_void") return "singularity-void-shirt";
  if (skinId === "quantum_holo") return "quantum-holo-shirt";
  return "redacted-shirt";
}

interface BobsShopProps {
  profile: UserProfile;
  onClose: () => void;
  onProfileUpdate: (p: UserProfile) => void;
  token: string;
  gameState?: "START" | "PLAYING" | "GAMEOVER";
  onPlaceLotus?: () => void;
  onUseLotus?: () => void;
}

export function BobsShop({ profile, onClose, onProfileUpdate, token, gameState = "START", onPlaceLotus, onUseLotus }: BobsShopProps) {
  const [tab, setTab] = useState<"shop" | "cases" | "skins" | "masteries">("shop");
  const [showCode, setShowCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [isUnboxing, setIsUnboxing] = useState(false);
  const [reelSkin, setReelSkin] = useState<typeof SKINS[number]>(SKINS[0]);
  const [unboxedResult, setUnboxedResult] = useState<{
    skin: typeof SKINS[number];
    isNew: boolean;
    refund: number;
  } | null>(null);

  const buyItem = useBuyItem(token);
  const buySkin = useBuySkin(token);
  const equipSkin = useEquipSkin(token);
  const upgradeHD = useUpgradeHardDrive(token);
  const upgradeCpu = useUpgradeCpu(token);
  const claimCpu = useClaimCpuCoins(token);
  const redeemCode = useRedeemCode(token);
  const openCase = useOpenCase(token);
  const { toast } = useToast();

  const getOwned = (field: string): number => (profile as any)[field] ?? 0;

  const handleBuy = (itemId: string) => {
    buyItem.mutate(itemId as any, {
      onSuccess: (p) => {
        onProfileUpdate(p);
        const item = SHOP_ITEMS.find(i => i.id === itemId);
        toast({ title: `${item?.label} purchased!`, description: `${item?.desc}` });
      },
      onError: (e: any) => toast({ title: "Purchase failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleBuySkin = (skinId: string) => {
    buySkin.mutate(skinId as any, {
      onSuccess: (p) => {
        onProfileUpdate(p);
        const skin = SKINS.find(s => s.id === skinId);
        toast({ title: `${skin?.label} acquired!`, description: "Equip it from the skin shop." });
      },
      onError: (e: any) => toast({ title: "Skin purchase failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleEquipSkin = (skinId: string) => {
    equipSkin.mutate(skinId as any, {
      onSuccess: (p) => {
        onProfileUpdate(p);
        const skin = SKINS.find(s => s.id === skinId);
        toast({ title: `${skin?.label} equipped`, description: "Your runner is ready for the next dash." });
      },
      onError: (e: any) => toast({ title: "Could not equip skin", description: e.message, variant: "destructive" }),
    });
  };

  const handleUpgradeHD = () => {
    upgradeHD.mutate(undefined, {
      onSuccess: (p) => {
        onProfileUpdate(p);
        const tier = HARD_DRIVE_TIERS.find(t => t.tier === p.hardDriveTier);
        toast({ title: `Hard Drive upgraded to ${tier?.name}!`, description: `Speed +${Math.round((tier?.speedBonus ?? 0) * 100)}%` });
      },
      onError: (e: any) => toast({ title: "Upgrade failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleUpgradeCpu = () => {
    upgradeCpu.mutate(undefined, {
      onSuccess: (p) => {
        onProfileUpdate(p);
        const tier = CPU_TIERS.find(t => t.tier === p.cpuTier);
        toast({ title: `CPU upgraded to ${tier?.name}!`, description: `Earn ${tier?.coinsPerClaim} coins every ${CPU_CLAIM_HOURS}h` });
      },
      onError: (e: any) => toast({ title: "Upgrade failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleClaimCpu = () => {
    claimCpu.mutate(undefined, {
      onSuccess: ({ coins, profile: p }) => {
        onProfileUpdate(p);
        toast({ title: `+${coins} CUDA coins claimed!`, description: "CPU passive income collected." });
      },
      onError: (e: any) => toast({ title: "Can't claim yet", description: e.message, variant: "destructive" }),
    });
  };

  const handleRedeem = () => {
    const input = codeInput.trim();
    if (!input) return;
    redeemCode.mutate(input, {
      onSuccess: (p) => {
        onProfileUpdate(p);
        if (input.toLowerCase() === "supersecret") {
          toast({ title: "SUPERSECRET REDEEMED!", description: "One Rare CD was added to your inventory." });
        } else {
          toast({ title: "Code redeemed!", description: "Check your inventory!" });
        }
        setCodeInput("");
        setShowCode(false);
      },
      onError: (e: any) => toast({ title: "Redeem failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleOpenCase = () => {
    if (profile.cudaCoins < CASE_COST) {
      toast({
        title: "Need more CUDA coins",
        description: `Mystery Cases cost ${CASE_COST} CUDA coins. Run the warehouse or claim CPU earnings!`,
        variant: "destructive",
      });
      return;
    }
    if (isUnboxing || openCase.isPending) return;

    setIsUnboxing(true);
    setUnboxedResult(null);

    const eligibleSkins = SKINS.filter(s => !s.secret);
    const interval = setInterval(() => {
      const randomSkin = eligibleSkins[Math.floor(Math.random() * eligibleSkins.length)];
      setReelSkin(randomSkin);
    }, 80);

    openCase.mutate(undefined, {
      onSuccess: (data) => {
        onProfileUpdate(data.profile);
        setTimeout(() => {
          clearInterval(interval);
          setReelSkin(data.skin);
          setIsUnboxing(false);
          setUnboxedResult({
            skin: data.skin,
            isNew: data.isNew,
            refund: data.refund,
          });
          if (data.skin.rarity === "super") {
            toast({ title: "🚨 0.01% SUPER SECRET DROP! 🚨", description: `MYTHIC: ${data.skin.label} (Animated)` });
          } else if (data.skin.rarity === "legendary") {
            toast({ title: "★ 2% LEGENDARY UNLOCKED! ★", description: `${data.skin.label} (Animated)` });
          } else {
            toast({ title: `${data.skin.label} unlocked!`, description: data.isNew ? "Added to your wardrobe." : `Duplicate! +${data.refund} CUDA coins refunded.` });
          }
        }, 1800);
      },
      onError: (e: any) => {
        clearInterval(interval);
        setIsUnboxing(false);
        toast({ title: "Case opening failed", description: e.message, variant: "destructive" });
      },
    });
  };

  const nextHDTier = profile.hardDriveTier < HD_MAX_TIER
    ? HARD_DRIVE_TIERS.find(t => t.tier === profile.hardDriveTier + 1)
    : null;
  const currentHDTier = profile.hardDriveTier > 0
    ? HARD_DRIVE_TIERS.find(t => t.tier === profile.hardDriveTier)
    : null;

  const nextCpuTier = profile.cpuTier < CPU_MAX_TIER
    ? CPU_TIERS.find(t => t.tier === profile.cpuTier + 1)
    : null;
  const currentCpuTier = profile.cpuTier > 0
    ? CPU_TIERS.find(t => t.tier === profile.cpuTier)
    : null;

  const cpuLastClaimed = profile.cpuLastClaimedAt ? new Date(profile.cpuLastClaimedAt) : null;
  const CLAIM_MS = CPU_CLAIM_HOURS * 60 * 60 * 1000;
  const nowMs = Date.now();
  const canClaimCpu = profile.cpuTier > 0 && (!cpuLastClaimed || nowMs - cpuLastClaimed.getTime() >= CLAIM_MS);
  const hoursUntilClaim = cpuLastClaimed && !canClaimCpu
    ? Math.ceil((CLAIM_MS - (nowMs - cpuLastClaimed.getTime())) / (60 * 60 * 1000))
    : 0;
  const storedClaims = currentCpuTier && cpuLastClaimed
    ? Math.min(Math.floor((nowMs - cpuLastClaimed.getTime()) / CLAIM_MS), 5)
    : (profile.cpuTier > 0 ? 1 : 0);
  const pendingCoins = currentCpuTier ? currentCpuTier.coinsPerClaim * Math.max(storedClaims, canClaimCpu ? 1 : 0) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.85, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-lg bg-background pixel-frame overflow-hidden"
        style={{ boxShadow: "0 0 40px rgba(255,204,0,0.2), 0 0 80px rgba(255,204,0,0.05)" }}
      >
        {/* Sign header */}
        <div className="relative bg-amber-950/80 border-b-4 border-amber-700/60 px-6 py-4 text-center">
          <div className="absolute inset-x-0 top-0 flex justify-around px-12">
            <div className="w-0.5 h-4 bg-amber-700" />
            <div className="w-0.5 h-4 bg-amber-700" />
          </div>
          <ShoppingBag className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
          <h2 className="font-arcade text-lg text-yellow-300 tracking-widest" style={{ textShadow: "0 0 20px rgba(255,204,0,0.6)" }}>
            JEFF'S SHOP
          </h2>
          <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Secret code panel */}
        {showCode && (
          <div className="px-6 py-3 bg-purple-500/5 border-b border-purple-500/20 flex items-center gap-3">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRedeem(); }}
              placeholder="Type code..."
              className="flex-1 bg-background border border-purple-500/30 px-3 py-2 font-tech text-xs text-purple-300 placeholder:text-purple-500/30 focus:outline-none focus:border-purple-500/60"
              disabled={redeemCode.isPending}
            />
            <button
              onClick={handleRedeem}
              disabled={redeemCode.isPending || !codeInput.trim()}
              className="font-arcade text-[9px] px-3 py-2 border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 disabled:opacity-30 transition-colors tracking-widest"
            >
              {redeemCode.isPending ? "..." : "REDEEM"}
            </button>
            <button onClick={() => setShowCode(false)} className="text-muted-foreground/50 hover:text-foreground text-xs px-1">
              ✕
            </button>
          </div>
        )}

        {/* Coin balance */}
        <div className="flex items-center justify-center gap-3 px-6 py-2.5 bg-yellow-500/5 border-b border-yellow-500/20">
          <Coins className="w-4 h-4 text-yellow-400" />
          <span className="font-arcade text-lg text-yellow-300">{profile.cudaCoins}</span>
          <span className="font-tech text-xs text-yellow-500/70 uppercase tracking-widest">CUDA COINS</span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-amber-700/30">
          {(["shop", "cases", "skins", "masteries"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 font-arcade text-[9px] sm:text-[10px] tracking-widest transition-colors ${
                tab === t ? "bg-amber-900/30 text-yellow-300 border-b-2 border-yellow-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "shop" ? "ITEMS" : t === "cases" ? "CASES" : t === "skins" ? "SKINS" : "MASTERIES"}
            </button>
          ))}
        </div>

        {/* SHOP tab */}
        {tab === "shop" && (
          <div className="px-4 py-4 space-y-2.5 max-h-[52vh] overflow-y-auto">
            {SHOP_ITEMS.map((item) => {
              const owned = getOwned(item.field);
              const canAfford = profile.cudaCoins >= item.cost;
              const atMax = owned >= item.max;
              const Icon = ITEM_ICONS[item.id] || ShoppingBag;
              const colorClass = ITEM_COLORS[item.id] || "text-foreground border-muted bg-card/20";

              return (
                <div key={item.id} className={`border p-3 ${colorClass} flex items-center justify-between gap-3`}>
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <div>
                      <div className="font-arcade text-[10px] tracking-widest mb-0.5">{item.label}</div>
                      <div className="font-tech text-xs text-muted-foreground leading-tight">{item.desc}</div>
                      <div className="font-tech text-[10px] mt-1 opacity-50">Owned: {owned}/{item.max}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-1 font-arcade text-sm text-yellow-300">
                      <Coins className="w-3 h-3" />{item.cost}
                    </div>
                    <button
                      onClick={() => handleBuy(item.id)}
                      disabled={!canAfford || atMax || buyItem.isPending}
                      className="font-arcade text-[9px] px-3 py-1.5 border-2 border-current hover:bg-current/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors tracking-widest"
                    >
                      {atMax ? "MAXED" : buyItem.isPending ? "..." : "BUY"}
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="border border-pink-500/40 bg-pink-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Flower2 className="w-5 h-5 text-pink-300" />
                <div className="font-arcade text-[11px] tracking-widest text-pink-300">LOTUS GARDEN</div>
              </div>
              <p className="font-tech text-xs text-muted-foreground leading-relaxed">
                Plant a weird flower on a vine mid-run. Its checkpoint stays saved through new runs until you respawn there.
              </p>
              {profile.lotusCheckpoint ? (
                <button
                  onClick={onUseLotus}
                  disabled={!onUseLotus}
                  className="mt-3 w-full py-2.5 flex items-center justify-center gap-2 font-arcade text-[10px] tracking-widest border-2 border-pink-400/60 text-pink-200 hover:bg-pink-400/10 disabled:opacity-40 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> RESPAWN AT LOTUS
                </button>
              ) : gameState === "PLAYING" && profile.lotuses > 0 ? (
                <button
                  onClick={onPlaceLotus}
                  disabled={!onPlaceLotus}
                  className="mt-3 w-full py-2.5 flex items-center justify-center gap-2 font-arcade text-[10px] tracking-widest border-2 border-pink-400/60 text-pink-200 hover:bg-pink-400/10 disabled:opacity-40 transition-colors"
                >
                  <Flower2 className="w-3 h-3" /> PLANT LOTUS HERE
                </button>
              ) : (
                <div className="mt-3 font-tech text-[10px] text-pink-300/60">
                  {gameState === "PLAYING" ? "BUY a LOTUS to plant a checkpoint." : "Start a run to plant a checkpoint."}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CASES tab */}
        {tab === "cases" && (
          <div className="px-4 py-4 space-y-4 max-h-[52vh] overflow-y-auto">
            {/* Mystery Case Showcase */}
            <div className="border-2 border-amber-500/50 bg-gradient-to-b from-amber-500/10 via-purple-500/5 to-black/40 p-4 text-center relative overflow-hidden">
              <div className="absolute top-2 right-2 flex items-center gap-1 font-arcade text-[8px] text-amber-300 bg-amber-500/20 px-2 py-0.5 border border-amber-500/40">
                <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" /> FAIR ODDS
              </div>

              <div className="my-2 flex justify-center">
                <div className="relative w-20 h-20 border-2 border-amber-400 bg-black/60 flex items-center justify-center shadow-[0_0_25px_rgba(255,190,0,0.35)]">
                  <Box className="w-10 h-10 text-amber-400 animate-bounce" />
                  <div className="absolute -inset-1 border border-yellow-400/40 pointer-events-none" />
                </div>
              </div>

              <div className="font-arcade text-sm text-yellow-300 tracking-widest mt-1">
                MYSTERY SKIN CRATE
              </div>
              <p className="font-tech text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Open to roll an exclusive warehouse runner outfit. Features fair calibrated odds and duplicate coin protection.
              </p>

              <div className="mt-4 flex items-center justify-center">
                <button
                  onClick={handleOpenCase}
                  disabled={profile.cudaCoins < CASE_COST || isUnboxing || openCase.isPending}
                  className="font-arcade text-xs px-6 py-3 border-2 border-yellow-400 text-yellow-300 bg-yellow-500/10 hover:bg-yellow-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all tracking-widest flex items-center gap-2 shadow-[0_0_15px_rgba(255,204,0,0.25)]"
                >
                  <Gift className="w-4 h-4 text-yellow-300" />
                  {isUnboxing ? "CRACKING CRATE..." : openCase.isPending ? "CONNECTING..." : `OPEN CASE — ${CASE_COST} COINS`}
                </button>
              </div>

              {profile.cudaCoins < CASE_COST && (
                <div className="font-tech text-[10px] text-destructive/80 mt-2">
                  Need {CASE_COST - profile.cudaCoins} more CUDA coins
                </div>
              )}
            </div>

            {/* Fair Odds Breakdown Table */}
            <div className="border border-muted/30 bg-black/30 p-3 space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-muted/20">
                <span className="font-arcade text-[10px] text-primary tracking-widest">OFFICIAL DROP CHANCES</span>
                <span className="font-tech text-[10px] text-muted-foreground">Fair 100% Total</span>
              </div>

              <div className="grid grid-cols-2 gap-2 font-tech text-xs">
                <div className="border border-slate-500/30 bg-slate-500/5 p-2 flex items-center justify-between">
                  <div>
                    <span className="font-arcade text-[9px] text-slate-300 block">COMMON</span>
                    <span className="text-[10px] text-muted-foreground">Depot Uniforms</span>
                  </div>
                  <span className="font-arcade text-xs text-slate-300">{CASE_RARITY_ODDS.common}%</span>
                </div>

                <div className="border border-cyan-500/30 bg-cyan-500/5 p-2 flex items-center justify-between">
                  <div>
                    <span className="font-arcade text-[9px] text-cyan-400 block">RARE</span>
                    <span className="text-[10px] text-muted-foreground">Coolant & Coppers</span>
                  </div>
                  <span className="font-arcade text-xs text-cyan-400">{CASE_RARITY_ODDS.rare}%</span>
                </div>

                <div className="border border-purple-500/30 bg-purple-500/5 p-2 flex items-center justify-between">
                  <div>
                    <span className="font-arcade text-[9px] text-purple-400 block">EPIC</span>
                    <span className="text-[10px] text-muted-foreground">Surge & Lights</span>
                  </div>
                  <span className="font-arcade text-xs text-purple-400">{CASE_RARITY_ODDS.epic}%</span>
                </div>

                <div className="border border-amber-400/50 bg-amber-500/10 p-2 flex items-center justify-between shadow-[0_0_10px_rgba(255,180,0,0.2)]">
                  <div>
                    <span className="font-arcade text-[9px] text-amber-300 block">LEGENDARY ★</span>
                    <span className="text-[10px] text-pink-300">Animated Quantum Holo</span>
                  </div>
                  <span className="font-arcade text-xs text-amber-300 font-bold">{CASE_RARITY_ODDS.legendary}%</span>
                </div>

                {/* 0.01% SUPER SECRET DROP */}
                <div className="col-span-2 border-2 border-red-500/70 bg-gradient-to-r from-red-950/50 via-yellow-950/40 to-purple-950/50 p-2.5 flex items-center justify-between shadow-[0_0_20px_rgba(255,0,0,0.35)]">
                  <div>
                    <span className="font-arcade text-[9px] text-red-400 flex items-center gap-1.5 tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-spin" /> SUPER SECRET (MYTHIC) ★
                    </span>
                    <span className="text-[10px] text-yellow-300 block mt-0.5 font-tech">Chrono Supernova & Void Singularity (Animated)</span>
                  </div>
                  <span className="font-arcade text-xs text-red-400 font-bold tracking-widest">{CASE_RARITY_ODDS.super}%</span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-muted/20 flex items-center justify-between font-tech text-[10px] text-muted-foreground">
                <span>Duplicate Protection:</span>
                <span className="text-yellow-300 font-arcade">+{CASE_DUPLICATE_REFUND} CUDA COINS REFUND</span>
              </div>
            </div>
          </div>
        )}

        {/* SKINS tab */}
        {tab === "skins" && (
          <div className="px-4 py-4 max-h-[52vh] overflow-y-auto space-y-3">
            <div className="flex items-center gap-2 px-1 pb-1">
              <Palette className="w-4 h-4 text-primary" />
              <div>
                <div className="font-arcade text-xs text-primary tracking-widest">RUNNER SKINS</div>
                <p className="font-tech text-[10px] text-muted-foreground">Cosmetic colors and animated suits for your warehouse dash.</p>
              </div>
            </div>
            {SKINS.map((skin) => {
              const owned = profile.ownedSkins.includes(skin.id);
              const equipped = profile.equippedSkin === skin.id;
              const canAfford = profile.cudaCoins >= skin.cost;
              const badge = RARITY_BADGES[skin.rarity];
              if (skin.secret && !owned) {
                return (
                  <div key={skin.id} className="border border-muted/20 bg-black/30 p-3 flex items-center gap-3 opacity-60" data-testid="skin-secret-locked">
                    <div className="w-14 h-14 shrink-0 border-2 border-[#39404e] flex items-center justify-center font-arcade text-lg text-[#667080]">?</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-arcade text-[10px] tracking-widest text-[#7a8291]">???</div>
                      <div className="font-tech text-xs text-muted-foreground mt-1">A secret skin. Not for sale — Runbun decides who gets it.</div>
                      <div className="font-tech text-[10px] mt-1 text-muted-foreground/60">LOCKED</div>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={skin.id}
                  className="border p-3 flex items-center gap-3"
                  style={{
                    borderColor: equipped ? `${skin.accent}a0` : `${skin.color}70`,
                    background: equipped ? `${skin.color}18` : "rgba(0,0,0,.12)",
                  }}
                >
                  <div className="relative w-14 h-14 shrink-0 border-2 flex items-center justify-center" style={{ borderColor: skin.accent, background: `${skin.color}22` }}>
                    <div className="w-7 h-8 relative overflow-hidden" style={{ background: skin.color, boxShadow: `inset 4px 0 ${skin.color}aa` }}>
                      {skin.animated && (
                        <div
                          className={`absolute inset-0 ${getSkinShirtClass(skin.id)}`}
                          aria-hidden
                        />
                      )}
                      <div className="w-3 h-2 mx-auto -mt-2 bg-[#ffd1b3] border-t-2 border-[#2a1500] relative" />
                    </div>
                    {equipped && <span className="absolute -right-2 -top-2 rounded-full bg-green-500 text-black p-0.5"><Check className="w-3 h-3" /></span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-arcade text-[10px] tracking-widest" style={{ color: skin.accent }}>{skin.label}</span>
                      <span className={`font-arcade text-[7px] px-1.5 py-0.2 border ${badge.border} ${badge.text} ${badge.bg}`}>
                        {badge.label}
                      </span>
                      {skin.animated && (
                        <span className="font-arcade text-[7px] px-1.5 py-0.2 border border-pink-500/50 text-pink-300 bg-pink-500/10">
                          ANIMATED
                        </span>
                      )}
                    </div>
                    <div className="font-tech text-xs text-muted-foreground mt-1">{skin.description}</div>
                    <div className="font-tech text-[10px] mt-1 text-muted-foreground/60">{owned ? (skin.secret ? "SECRET · OWNED" : "OWNED") : `${skin.cost} CUDA coins`}</div>
                  </div>
                  <button
                    onClick={() => owned ? handleEquipSkin(skin.id) : handleBuySkin(skin.id)}
                    disabled={equipped || (!owned && !canAfford) || buySkin.isPending || equipSkin.isPending}
                    className="font-arcade text-[9px] px-3 py-2 border-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors tracking-widest"
                    style={{ color: skin.accent, borderColor: `${skin.accent}80` }}
                  >
                    {equipped ? "EQUIPPED" : owned ? "EQUIP" : buySkin.isPending ? "..." : "BUY"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* MASTERIES tab */}
        {tab === "masteries" && (
          <div className="px-4 py-4 max-h-[52vh] overflow-y-auto space-y-4">

            {/* Hard Drive section */}
            <div className="border border-blue-500/20 bg-blue-500/3">
              <div className="px-4 py-3 border-b border-blue-500/20 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-400" />
                <span className="font-arcade text-xs text-blue-300 tracking-widest">HARD DRIVE</span>
                <span className="font-tech text-xs text-muted-foreground/60 ml-auto">Permanent speed boost</span>
              </div>

              {currentHDTier ? (
                <div className={`mx-4 mt-3 px-4 py-3 border ${TIER_BG[currentHDTier.tier]} text-center`}>
                  <div className="font-arcade text-base tracking-widest" style={{ color: currentHDTier.color }}>
                    {currentHDTier.name}
                  </div>
                  <div className="font-tech text-xs text-muted-foreground mt-1">
                    +{Math.round(currentHDTier.speedBonus * 100)}% base speed
                  </div>
                </div>
              ) : (
                <div className="mx-4 mt-3 px-4 py-3 border border-muted/20 text-center">
                  <div className="font-arcade text-xs text-muted-foreground tracking-widest">NOT UNLOCKED</div>
                </div>
              )}

              <div className="px-4 py-3">
                <div className="flex items-center gap-0.5 mb-3 flex-wrap">
                  {HARD_DRIVE_TIERS.map((t, i) => (
                    <div key={t.tier} className="flex items-center gap-0.5">
                      <div
                        className={`px-1 h-5 flex items-center justify-center font-arcade text-[7px] transition-all ${
                          profile.hardDriveTier >= t.tier ? "opacity-100" : "opacity-30"
                        }`}
                        style={{
                          background: profile.hardDriveTier >= t.tier ? `${t.color}22` : 'transparent',
                          border: `1px solid ${profile.hardDriveTier >= t.tier ? t.color : '#444'}`,
                          color: t.color,
                        }}
                      >
                        {t.name}
                      </div>
                      {i < HARD_DRIVE_TIERS.length - 1 && (
                        <ChevronRight className="w-2 h-2 text-muted-foreground/30 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>

                {nextHDTier ? (
                  <button
                    onClick={handleUpgradeHD}
                    disabled={profile.cudaCoins < nextHDTier.cost || upgradeHD.isPending}
                    className="w-full py-3 flex items-center justify-center gap-2 font-arcade text-xs tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                      border: `2px solid ${nextHDTier.color}80`,
                      color: nextHDTier.color,
                      background: profile.cudaCoins >= nextHDTier.cost ? `${nextHDTier.color}10` : 'transparent',
                    }}
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    {upgradeHD.isPending ? "PROCESSING..." : (
                      <>
                        {profile.hardDriveTier === 0 ? "BUY" : "UPGRADE TO"} {nextHDTier.name}
                        <span className="ml-2 flex items-center gap-1 text-yellow-300">
                          <Coins className="w-3 h-3" />{nextHDTier.cost}
                        </span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="text-center font-arcade text-xs py-3" style={{ color: '#ff4400', textShadow: "0 0 10px rgba(255,68,0,0.5)" }}>
                    ★ DRAGON'S BREATH — MAX TIER ★
                  </div>
                )}

                <div className="mt-2 space-y-1">
                  {HARD_DRIVE_TIERS.map(t => (
                    <div key={t.tier} className="flex items-center justify-between font-tech text-[10px]">
                      <span style={{ color: profile.hardDriveTier >= t.tier ? t.color : '#555' }}>
                        {profile.hardDriveTier >= t.tier ? "✓" : "○"} {t.name}
                      </span>
                      <span className="text-muted-foreground/50">
                        +{Math.round(t.speedBonus * 100)}% speed
                        {profile.hardDriveTier < t.tier && <span className="ml-2 text-yellow-500/70">{t.cost} coins</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CPU Mastery section */}
            <div className="border border-cyan-500/20 bg-cyan-500/3">
              <div className="px-4 py-3 border-b border-cyan-500/20 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span className="font-arcade text-xs text-cyan-300 tracking-widest">CPU MASTERY</span>
                <span className="font-tech text-xs text-muted-foreground/60 ml-auto">Passive coin income</span>
              </div>

              {currentCpuTier ? (
                <div className={`mx-4 mt-3 px-4 py-3 border ${TIER_BG[currentCpuTier.tier]} text-center`}>
                  <div className="font-arcade text-base tracking-widest" style={{ color: currentCpuTier.color }}>
                    {currentCpuTier.name}
                  </div>
                  <div className="font-tech text-xs text-muted-foreground mt-1">
                    +{currentCpuTier.coinsPerClaim} coins every {CPU_CLAIM_HOURS}h
                  </div>
                </div>
              ) : (
                <div className="mx-4 mt-3 px-4 py-3 border border-muted/20 text-center">
                  <div className="font-arcade text-xs text-muted-foreground tracking-widest">NO CPU INSTALLED</div>
                </div>
              )}

              <div className="px-4 py-3 space-y-3">
                {/* Claim button */}
                {profile.cpuTier > 0 && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleClaimCpu}
                      disabled={!canClaimCpu || claimCpu.isPending}
                      className="flex-1 py-2.5 flex items-center justify-center gap-2 font-arcade text-[10px] tracking-widest border-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        borderColor: canClaimCpu ? '#00ffcc80' : '#33557755',
                        color: canClaimCpu ? '#00ffcc' : '#335577',
                        background: canClaimCpu ? '#00ffcc10' : 'transparent',
                      }}
                    >
                      <Coins className="w-3 h-3" />
                      {claimCpu.isPending
                        ? "CLAIMING..."
                        : canClaimCpu
                          ? `CLAIM +${pendingCoins} COINS`
                          : `NEXT CLAIM IN ${hoursUntilClaim}H`}
                    </button>
                  </div>
                )}

                {/* Upgrade button */}
                {nextCpuTier ? (
                  <button
                    onClick={handleUpgradeCpu}
                    disabled={profile.cudaCoins < nextCpuTier.cost || upgradeCpu.isPending}
                    className="w-full py-3 flex items-center justify-center gap-2 font-arcade text-xs tracking-widest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                      border: `2px solid ${nextCpuTier.color}80`,
                      color: nextCpuTier.color,
                      background: profile.cudaCoins >= nextCpuTier.cost ? `${nextCpuTier.color}10` : 'transparent',
                    }}
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    {upgradeCpu.isPending ? "PROCESSING..." : (
                      <>
                        {profile.cpuTier === 0 ? "INSTALL" : "UPGRADE TO"} {nextCpuTier.name}
                        <span className="ml-2 flex items-center gap-1 text-yellow-300">
                          <Coins className="w-3 h-3" />{nextCpuTier.cost}
                        </span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="text-center font-arcade text-xs py-2" style={{ color: '#ff4400', textShadow: "0 0 10px rgba(255,68,0,0.5)" }}>
                    ★ DRAGON'S BREATH — MAX TIER ★
                  </div>
                )}

                {/* Tier list */}
                <div className="space-y-1">
                  {CPU_TIERS.map(t => (
                    <div key={t.tier} className="flex items-center justify-between font-tech text-[10px]">
                      <span style={{ color: profile.cpuTier >= t.tier ? t.color : '#555' }}>
                        {profile.cpuTier >= t.tier ? "✓" : "○"} {t.name}
                      </span>
                      <span className="text-muted-foreground/50">
                        +{t.coinsPerClaim} coins / {CPU_CLAIM_HOURS}h
                        {profile.cpuTier < t.tier && <span className="ml-2 text-yellow-500/70">{t.cost} coins</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}

        <div className="px-6 py-2.5 border-t border-muted/20 bg-card/10 flex items-center justify-between">
          <p className="font-tech text-[10px] text-muted-foreground/50">
            Earn 2 CUDA coins per 1M CUDA cores
          </p>
          <button
            onClick={() => setShowCode(s => !s)}
            className="w-5 h-5 flex items-center justify-center border border-muted/30 text-muted-foreground/50 hover:text-foreground hover:border-muted/60 transition-colors text-xs"
            title="Secret code"
          >
            <HelpCircle className="w-3 h-3" />
          </button>
        </div>

        {/* Unboxing Suspense Overlay */}
        <AnimatePresence>
          {isUnboxing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 z-40 flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="font-arcade text-xs text-yellow-300 tracking-widest mb-3 animate-pulse">
                DECRYPTING WAREHOUSE CASE...
              </div>

              <div className="relative w-28 h-28 border-4 border-yellow-400/80 bg-black/80 flex items-center justify-center mb-4 overflow-hidden shadow-[0_0_30px_rgba(255,204,0,0.4)]">
                <div
                  className="w-14 h-16 relative overflow-hidden"
                  style={{ background: reelSkin.color }}
                >
                  {reelSkin.animated && (
                    <div
                      className={`absolute inset-0 ${getSkinShirtClass(reelSkin.id)}`}
                      aria-hidden
                    />
                  )}
                  <div className="w-5 h-3 mx-auto -mt-3 bg-[#ffd1b3] border-t-2 border-[#2a1500]" />
                </div>
              </div>

              <div className="font-arcade text-sm text-white tracking-widest uppercase mb-1">
                {reelSkin.label}
              </div>
              <div className="font-tech text-xs text-muted-foreground">
                Checking depot inventory...
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Unboxed Prize Reveal Modal */}
        <AnimatePresence>
          {unboxedResult && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 z-40 flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="font-arcade text-[10px] text-yellow-400 tracking-widest mb-2 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                {unboxedResult.skin.rarity === "super"
                  ? "🚨 0.01% SUPER SECRET MYTHIC! 🚨"
                  : unboxedResult.skin.rarity === "legendary"
                  ? "★ LEGENDARY JACKPOT! ★"
                  : "CASE UNLOCKED!"}
                <Sparkles className="w-3.5 h-3.5" />
              </div>

              <div
                className="relative w-28 h-28 border-4 flex items-center justify-center mb-3 shadow-[0_0_35px_rgba(255,204,0,0.3)]"
                style={{
                  borderColor: unboxedResult.skin.accent,
                  background: `${unboxedResult.skin.color}25`,
                }}
              >
                <div
                  className="w-14 h-16 relative overflow-hidden"
                  style={{ background: unboxedResult.skin.color, boxShadow: `inset 4px 0 ${unboxedResult.skin.color}aa` }}
                >
                  {unboxedResult.skin.animated && (
                    <div
                      className={`absolute inset-0 ${getSkinShirtClass(unboxedResult.skin.id)}`}
                      aria-hidden
                    />
                  )}
                  <div className="w-5 h-3 mx-auto -mt-3 bg-[#ffd1b3] border-t-2 border-[#2a1500]" />
                </div>
              </div>

              <div className="font-arcade text-base tracking-widest mb-1" style={{ color: unboxedResult.skin.accent }}>
                {unboxedResult.skin.label}
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className={`font-arcade text-[8px] px-2 py-0.5 border ${RARITY_BADGES[unboxedResult.skin.rarity].border} ${RARITY_BADGES[unboxedResult.skin.rarity].text} ${RARITY_BADGES[unboxedResult.skin.rarity].bg}`}>
                  {RARITY_BADGES[unboxedResult.skin.rarity].label}
                </span>
                {unboxedResult.skin.animated && (
                  <span className="font-arcade text-[8px] px-2 py-0.5 border border-pink-500/50 text-pink-300 bg-pink-500/10">
                    ANIMATED
                  </span>
                )}
              </div>

              <p className="font-tech text-xs text-muted-foreground max-w-xs mb-3">
                {unboxedResult.skin.description}
              </p>

              {unboxedResult.isNew ? (
                <div className="font-tech text-xs text-emerald-400 mb-4 bg-emerald-500/10 px-3 py-1 border border-emerald-500/30">
                  NEW SKIN ADDED TO WARDROBE!
                </div>
              ) : (
                <div className="font-tech text-xs text-yellow-300 mb-4 bg-yellow-500/10 px-3 py-1 border border-yellow-500/30">
                  DUPLICATE! +{unboxedResult.refund} CUDA COINS REFUNDED
                </div>
              )}

              <div className="flex gap-2 w-full max-w-xs">
                <button
                  onClick={() => {
                    handleEquipSkin(unboxedResult.skin.id);
                    setUnboxedResult(null);
                  }}
                  className="flex-1 font-arcade text-[10px] py-2.5 border-2 border-emerald-400 text-emerald-300 hover:bg-emerald-400/20 tracking-widest transition-colors"
                >
                  EQUIP NOW
                </button>
                <button
                  onClick={() => setUnboxedResult(null)}
                  className="flex-1 font-arcade text-[10px] py-2.5 border-2 border-muted-foreground text-foreground hover:bg-muted/20 tracking-widest transition-colors"
                >
                  DONE
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
