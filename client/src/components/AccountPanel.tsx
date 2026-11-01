import { motion } from "framer-motion";
import { Award, Check, Lock, Palette, X, Disc3, Trophy, HelpCircle } from "lucide-react";
import { ACHIEVEMENTS, SKINS, RANK_TIERS } from "@shared/schema";
import type { UserProfile } from "@shared/schema";
import { usePublicProfile } from "@/hooks/use-high-scores";
import { RankBadge } from "@/components/RankBadge";
import { Link } from "wouter";

interface AccountPanelProps {
  profile: UserProfile;
  onClose: () => void;
}

export function AccountPanel({ profile, onClose }: AccountPanelProps) {
  const unlocked = new Set(profile.achievements);
  const equipped = SKINS.find(skin => skin.id === profile.equippedSkin) ?? SKINS[0];
  const { data: pub } = usePublicProfile(profile.id);
  const rank = pub?.rank;
  const nextTier = rank?.nextMinCores != null ? RANK_TIERS.find(t => t.minCores === rank.nextMinCores) : null;
  const progressToNext = (() => {
    if (!pub || !rank || rank.nextMinCores == null) return 100;
    const current = RANK_TIERS.find(t => t.id === rank.id);
    const from = current?.minCores ?? 0;
    return Math.max(0, Math.min(100, Math.round(((pub.bestCores - from) / (rank.nextMinCores - from)) * 100)));
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[450] bg-black/90 flex items-center justify-center p-4"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-2xl max-h-[88vh] overflow-hidden bg-background border-2 border-secondary/50 neon-box-cyan"
      >
        <div className="flex items-center justify-between px-6 py-4 bg-secondary/10 border-b border-secondary/30">
          <div className="flex items-center gap-3">
            <Award className="w-5 h-5 text-secondary" />
            <div>
              <h2 className="font-arcade text-sm text-secondary tracking-widest">ACCOUNT // {profile.username}</h2>
              <p className="font-tech text-[10px] text-secondary/60 tracking-widest">BADGES, ADVANCEMENTS & LOADOUT</p>
            </div>
          </div>
          <button onClick={onClose} className="text-secondary/60 hover:text-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[calc(88vh-76px)] overflow-y-auto p-5 space-y-5">
          <div className="border border-accent/30 bg-accent/5 p-4" data-testid="account-rank-card">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-accent" />
                <span className="font-tech text-[10px] text-accent/70 tracking-widest">CURRENT RANK</span>
              </div>
              {pub?.id ? (
                <Link href={`/player/${pub.id}`} className="font-tech text-[10px] text-secondary/70 hover:text-secondary tracking-widest underline underline-offset-4" data-testid="link-own-player-page">
                  VIEW PUBLIC PAGE →
                </Link>
              ) : null}
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {rank ? <RankBadge rank={rank} size="md" /> : <span className="font-arcade text-[10px] text-muted-foreground animate-pulse">CALCULATING...</span>}
              {pub && (
                <span className="font-tech text-xs text-muted-foreground">
                  best run <span className="text-primary font-arcade text-[10px]">{pub.bestCores.toLocaleString()}</span> cores
                  {pub.leaderboardPosition ? <> · leaderboard <span className="text-accent">#{pub.leaderboardPosition}</span></> : null}
                </span>
              )}
            </div>
            {rank && rank.position === null && nextTier && (
              <div className="mt-3">
                <div className="flex justify-between font-tech text-[10px] text-muted-foreground tracking-widest">
                  <span>NEXT: <span style={{ color: nextTier.color }}>{nextTier.label}</span></span>
                  <span>{nextTier.minCores.toLocaleString()} cores</span>
                </div>
                <div className="h-1.5 bg-muted/30 mt-1 overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${progressToNext}%`, background: nextTier.color }} />
                </div>
              </div>
            )}
            {rank && rank.position !== null && (
              <p className="font-tech text-xs text-muted-foreground mt-2">A top-3 leaderboard title. Hold your spot to keep it.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="border border-secondary/25 bg-secondary/5 p-4">
              <div className="font-tech text-[10px] text-secondary/60 tracking-widest">ADVANCEMENTS</div>
              <div className="font-arcade text-2xl text-secondary mt-2">
                {profile.achievements.length}<span className="text-secondary/30 text-sm">/{ACHIEVEMENTS.length}</span>
              </div>
              <div className="font-tech text-xs text-muted-foreground mt-1">badges unlocked</div>
            </div>
            <div className="border border-primary/25 bg-primary/5 p-4">
              <div className="font-tech text-[10px] text-primary/60 tracking-widest">EQUIPPED SKIN</div>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-5 h-5 border-2" style={{ background: equipped.color, borderColor: equipped.accent }} />
                <span className="font-arcade text-xs text-primary">{equipped.label}</span>
              </div>
              <div className="font-tech text-xs text-muted-foreground mt-1">{profile.ownedSkins.length} skin{profile.ownedSkins.length === 1 ? "" : "s"} owned</div>
            </div>
          </div>

          {(profile.rareCds > 0 || profile.runbunGifted > 0) && (
            <div className="border border-white/20 bg-white/5 p-3 flex items-center gap-3" data-testid="account-rare-cds">
              <Disc3 className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '4s' }} />
              <div className="font-tech text-xs text-muted-foreground">
                <span className="text-white font-arcade text-[10px]">RARE CDs: {profile.rareCds}</span>
                {profile.runbunGifted > 0 && <span className="ml-3">· given to Runbun: {profile.runbunGifted}</span>}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-accent" />
              <h3 className="font-arcade text-xs text-accent tracking-widest">ACHIEVEMENTS & ADVANCEMENTS</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {ACHIEVEMENTS.map((achievement) => {
                const isUnlocked = unlocked.has(achievement.id);
                const isSecret = 'secret' in achievement && achievement.secret === true;
                if (isSecret && !isUnlocked) {
                  return (
                    <div key={achievement.id} className="flex gap-3 p-3 border border-muted/20 bg-black/30 opacity-60" data-testid="badge-secret-locked">
                      <div className="w-10 h-10 shrink-0 flex items-center justify-center border-2 border-[#39404e] text-[#667080]">
                        <HelpCircle className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-arcade text-[10px] tracking-wide text-[#7a8291]">???</div>
                        <p className="font-tech text-xs text-muted-foreground mt-1 leading-snug">A secret badge. Someone on the start screen knows how.</p>
                        <div className="font-tech text-[9px] mt-1 tracking-widest text-[#596170]">HIDDEN</div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={achievement.id}
                    className={`flex gap-3 p-3 border transition-colors ${isUnlocked ? "bg-card/70" : "bg-black/20 border-muted/20 opacity-55"}`}
                    style={{ borderColor: isUnlocked ? `${achievement.color}70` : undefined }}
                  >
                    <div
                      className="w-10 h-10 shrink-0 flex items-center justify-center border-2"
                      style={{
                        color: isUnlocked ? achievement.color : "#667080",
                        borderColor: isUnlocked ? achievement.color : "#39404e",
                        background: isUnlocked ? `${achievement.color}18` : "transparent",
                      }}
                    >
                      {isUnlocked ? <Check className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-arcade text-[10px] tracking-wide" style={{ color: isUnlocked ? achievement.color : "#7a8291" }}>
                        {achievement.label}
                      </div>
                      <p className="font-tech text-xs text-muted-foreground mt-1 leading-snug">{achievement.description}</p>
                      <div className="font-tech text-[9px] mt-1 tracking-widest" style={{ color: isUnlocked ? achievement.color : "#596170" }}>
                        {isUnlocked ? "UNLOCKED" : "LOCKED"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-muted/20 pt-4">
            <Palette className="w-4 h-4 text-primary" />
            <p className="font-tech text-xs text-muted-foreground">
              Visit <span className="text-primary">JEFF'S SHOP → SKINS</span> to customize your runner.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}