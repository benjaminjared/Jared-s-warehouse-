import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSubmitHighScore, useAwardCoins } from "@/hooks/use-high-scores";
import { GameStats } from "@/lib/game-engine";
import { Skull, Play, Trophy, CircuitBoard, ChevronRight, Coins, LogIn, Disc3, ShoppingBag, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AuthState } from "@/hooks/use-auth";
import type { UserProfile } from "@shared/schema";
import { advanceQuestProgress, type RankQuest } from "@/lib/rank-quests";
import { RankQuestBoard } from "@/components/RankQuestBoard";

interface GameOverModalProps {
  stats: GameStats;
  onRestart: () => void;
  onOpenShop?: () => void;
  onMainMenu?: () => void;
  auth: AuthState | null;
  onProfileUpdate?: (p: UserProfile) => void;
  quests?: RankQuest[];
  questProgress?: Record<string, number>;
}

function formatCores(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export function GameOverModal({ stats, onRestart, auth, onProfileUpdate, quests = [], questProgress = {} }: GameOverModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const submitScore = useSubmitHighScore(auth?.token);
  const awardCoins = useAwardCoins(auth?.token);
  const { toast } = useToast();

  useEffect(() => {
    if (!auth?.token || submitted) return;

    const run = async () => {
      try {
        // Submit score
        await submitScore.mutateAsync({
          score: stats.score,
          cudaCoresCollected: stats.cudaCores,
          distance: stats.distance,
          flopsCollected: stats.flopsCollected,
          rareCds: stats.rareCds,
          pcBuildFast: stats.pcBuildFast,
        });

        // Award CUDA coins
        const result = await awardCoins.mutateAsync(stats.cudaCores);
        setCoinsEarned(result.coinsEarned);
        if (onProfileUpdate) onProfileUpdate(result.profile);

        if (stats.rareCds > 0) {
          toast({
            title: "RARE CD FOUND",
            description: "Runbun on the start screen might want this...",
          });
        }

        setSubmitted(true);

        if (result.coinsEarned > 0) {
          toast({
            title: `+${result.coinsEarned} CUDA COINS`,
            description: `${formatCores(stats.cudaCores)} CUDA cores processed.`,
          });
        } else {
          toast({
            title: "RUN SAVED",
            description: "Score uploaded to the mainframe.",
          });
        }
      } catch {
        setSubmitted(true); // Don't retry
      }
    };

    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center overflow-y-auto overscroll-contain p-4 z-50"
    >
      <motion.div
        initial={{ scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-xl max-h-[calc(100dvh-2rem)] my-auto bg-background/95 neon-box-pink pixel-frame pixel-frame-bottom scanlines overflow-y-auto"
      >
        <div className="w-full overflow-hidden bg-primary/8 border-b border-primary/30 py-1">
          <div className="ticker-inner font-arcade text-[10px] text-primary/70 tracking-widest">
            &gt;&gt;&gt; JARED FAILED THE RUN — RESTART THE DASH — COLLECT CUDA CORES — VISIT JEFF'S SHOP —&nbsp;
          </div>
        </div>

        <div className="text-center px-8 pt-8 pb-6">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="h-px w-12 bg-destructive/50" />
            <CircuitBoard className="w-5 h-5 text-secondary" />
            <div className="h-px w-12 bg-destructive/50" />
          </div>
          <Skull className="w-16 h-16 mx-auto text-destructive mb-4 animate-pulse" />
          <h1 className="flicker text-4xl text-destructive text-glow mb-3">GAME OVER</h1>
          <p className="text-sm font-tech text-muted-foreground uppercase px-4 leading-relaxed">
            JARED WAS FIRED BECAUSE HE DIDN'T MAKE IT PAST THE TRIAL.
          </p>
        </div>

        <div className="mx-6 mb-6 terminal-box font-tech text-lg space-y-3">
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground flex items-center gap-2"><Trophy className="w-4 h-4 text-accent" /> FINAL SCORE:</span>
            <span className="font-arcade text-secondary">{stats.score.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">DISTANCE:</span>
            <span className="text-foreground">{stats.distance}m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">CUDA CORES:</span>
            <span className="text-primary font-arcade">{formatCores(stats.cudaCores)}</span>
          </div>
          {stats.rareCds > 0 && (
            <div className="flex justify-between items-center gap-4">
              <span className="text-muted-foreground flex items-center gap-2"><Disc3 className="w-4 h-4 text-white animate-spin" style={{ animationDuration: '3s' }} /> RARE CD:</span>
              <span className="text-white font-arcade text-sm">×{stats.rareCds}</span>
            </div>
          )}
          <div className="pt-2 mt-2 border-t border-muted text-center">
            <span className="text-sm text-muted-foreground block mb-1">ACHIEVEMENT</span>
            <span className="font-arcade text-accent text-glow text-sm">{stats.milestone}</span>
          </div>
        </div>

        {quests.length > 0 && (
          <div className="mx-6 mb-6">
            <RankQuestBoard quests={quests} progress={advanceQuestProgress(quests, stats, questProgress)} mode="result" />
          </div>
        )}

        {/* Auth-aware result section */}
        <div className="mx-6 mb-6">
          {auth ? (
            <div className="terminal-box text-center space-y-2">
              {submitted ? (
                <>
                  <div className="font-arcade text-xs text-secondary text-glow tracking-widest">SCORE SAVED ✓</div>
                  {coinsEarned > 0 && (
                    <div className="flex items-center justify-center gap-2 text-yellow-400">
                      <Coins className="w-4 h-4" />
                      <span className="font-arcade text-sm">+{coinsEarned} CUDA COINS</span>
                    </div>
                  )}
                  <div className="font-tech text-xs text-muted-foreground/60 mt-1">
                    Logged in as <span className="text-secondary">{auth.profile.username}</span>
                  </div>
                </>
              ) : (
                <div className="font-arcade text-xs text-secondary/60 animate-pulse">UPLOADING RUN...</div>
              )}
            </div>
          ) : (
            <div className="terminal-box border-muted/30 text-center space-y-2">
              <LogIn className="w-5 h-5 text-muted-foreground mx-auto" />
              <p className="font-arcade text-[9px] text-muted-foreground tracking-widest">
                LOG IN TO SAVE SCORES &amp; EARN CUDA COINS
              </p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 space-y-2.5">
          <button
            onClick={onRestart}
            className="w-full bg-primary text-primary-foreground font-arcade py-3.5 flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors arcade-shadow-active arcade-btn-pulse text-xs tracking-wider"
          >
            <Play className="w-4 h-4" /> PLAY AGAIN <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <div className="flex gap-2">
            {onOpenShop && (
              <button
                onClick={onOpenShop}
                className="flex-1 py-2.5 px-3 border-2 border-amber-500/60 bg-amber-500/10 text-yellow-300 hover:bg-amber-500/20 transition-colors font-arcade text-[9px] tracking-widest flex items-center justify-center gap-1.5"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-yellow-400" /> JEFF'S SHOP
              </button>
            )}
            {onMainMenu && (
              <button
                onClick={onMainMenu}
                className="flex-1 py-2.5 px-3 border border-border/60 bg-card/40 text-muted-foreground hover:text-foreground hover:border-secondary/60 transition-colors font-arcade text-[9px] tracking-widest flex items-center justify-center gap-1.5"
              >
                <Home className="w-3.5 h-3.5" /> MAIN MENU
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
