import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Award, Calendar, Check, Cpu, HardDrive, HelpCircle, Lock, MapPin, Trophy, User } from "lucide-react";
import { ACHIEVEMENTS, HARD_DRIVE_TIERS, CPU_TIERS, RANK_TIERS, SKINS } from "@shared/schema";
import { usePublicProfile } from "@/hooks/use-high-scores";
import { RankBadge } from "@/components/RankBadge";

function formatCores(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

/** Small canvas-free preview of a skin; the secret skin animates via CSS. */
function SkinPreview({ skinId }: { skinId: string }) {
  const skin = SKINS.find(s => s.id === skinId) ?? SKINS[0];
  return (
    <div className="relative w-14 h-16 border-2 overflow-hidden" style={{ background: skin.color, borderColor: skin.accent }} title={skin.label}>
      {skin.animated && (
        <div className="absolute inset-0 redacted-shirt" aria-hidden />
      )}
      <div className="absolute bottom-1 left-1 right-1 h-1" style={{ background: skin.accent }} />
    </div>
  );
}

export default function PlayerPage() {
  const [, params] = useRoute("/player/:id");
  const id = params ? Number(params.id) : null;
  const { data: player, isLoading, isError, error } = usePublicProfile(id && Number.isInteger(id) ? id : null);

  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-2 font-arcade text-[10px] text-secondary/80 hover:text-secondary tracking-widest mb-6" data-testid="link-back-home">
          <ArrowLeft className="w-4 h-4" /> BACK TO THE WAREHOUSE
        </Link>

        {isLoading ? (
          <div className="neon-box-cyan bg-background/80 p-12 text-center font-arcade text-xs text-secondary animate-pulse tracking-widest">
            LOADING PLAYER FILE...
          </div>
        ) : isError || !player ? (
          <div className="neon-box-pink bg-background/80 p-12 text-center space-y-3">
            <div className="font-arcade text-sm text-destructive tracking-widest">PLAYER NOT FOUND</div>
            <p className="font-tech text-xs text-muted-foreground">{(error as Error | undefined)?.message ?? "This account page does not exist."}</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            {/* Header */}
            <div className="neon-box-cyan bg-background/85 border-2 border-secondary/40 p-6">
              <div className="flex flex-wrap items-center gap-5">
                <SkinPreview skinId={player.equippedSkin} />
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 font-tech text-[10px] text-secondary/60 tracking-widest">
                    <User className="w-3 h-3" /> PLAYER FILE #{player.id}
                  </div>
                  <h1 className="font-arcade text-xl text-secondary text-glow uppercase tracking-wider mt-1 break-all" data-testid="text-player-username">
                    {player.username}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <RankBadge rank={player.rank} size="md" />
                    {player.leaderboardPosition ? (
                      <span className="font-tech text-xs text-accent inline-flex items-center gap-1">
                        <Trophy className="w-3 h-3" /> LEADERBOARD #{player.leaderboardPosition}
                      </span>
                    ) : (
                      <span className="font-tech text-xs text-muted-foreground">Unranked on the leaderboard</span>
                    )}
                  </div>
                </div>
                <div className="font-tech text-xs text-muted-foreground inline-flex items-center gap-2">
                  <Calendar className="w-3 h-3" /> Joined {new Date(player.joinedAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="BEST CORES" value={formatCores(player.bestCores)} color="text-primary" />
              <Stat label="BEST SCORE" value={player.bestScore.toLocaleString()} color="text-secondary" />
              <Stat label="BEST DISTANCE" value={`${player.bestDistance.toLocaleString()}m`} color="text-accent" icon={<MapPin className="w-3 h-3" />} />
              <Stat label="BADGES" value={`${player.achievements.length}/${ACHIEVEMENTS.length}`} color="text-foreground" icon={<Award className="w-3 h-3" />} />
            </div>

            {/* Rank ladder */}
            <div className="border-2 border-accent/30 bg-accent/5 p-4">
              <div className="font-arcade text-[10px] text-accent tracking-widest mb-3">RANK LADDER</div>
              <div className="flex flex-wrap gap-1.5">
                {RANK_TIERS.map(tier => {
                  const reached = player.bestCores >= tier.minCores;
                  const current = player.rank.id === tier.id;
                  return (
                    <span
                      key={tier.id}
                      className={`font-arcade text-[8px] px-2 py-1 border ${current ? "border-2" : ""}`}
                      style={{
                        color: reached ? tier.color : "#596170",
                        borderColor: reached ? tier.color : "#2c313c",
                        background: current ? `${tier.color}22` : "transparent",
                      }}
                      title={`${tier.minCores.toLocaleString()} cores`}
                    >
                      {tier.label}
                    </span>
                  );
                })}
              </div>
              <p className="font-tech text-[10px] text-muted-foreground mt-3">
                Ranks come from your best CUDA-core run. The global top 3 hold special titles: #3 JAILBREAKER, #2 CHEAT MASTER, #1 COOL JARED.
              </p>
            </div>

            {/* Gear */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="border border-secondary/25 bg-secondary/5 p-4 flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-secondary" />
                <div>
                  <div className="font-tech text-[10px] text-secondary/60 tracking-widest">HARD DRIVE</div>
                  <div className="font-arcade text-xs" style={{ color: HARD_DRIVE_TIERS[player.hardDriveTier - 1]?.color ?? "#7a8291" }}>
                    {HARD_DRIVE_TIERS[player.hardDriveTier - 1]?.name ?? "NONE"}
                  </div>
                </div>
              </div>
              <div className="border border-primary/25 bg-primary/5 p-4 flex items-center gap-3">
                <Cpu className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-tech text-[10px] text-primary/60 tracking-widest">CPU</div>
                  <div className="font-arcade text-xs" style={{ color: CPU_TIERS[player.cpuTier - 1]?.color ?? "#7a8291" }}>
                    {CPU_TIERS[player.cpuTier - 1]?.name ?? "NONE"}
                  </div>
                </div>
              </div>
            </div>

            {/* Badges */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-accent" />
                <h3 className="font-arcade text-xs text-accent tracking-widest">BADGES</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {ACHIEVEMENTS.map(achievement => {
                  const isUnlocked = player.achievements.includes(achievement.id);
                  const isSecret = "secret" in achievement && achievement.secret === true;
                  if (isSecret && !isUnlocked) {
                    return (
                      <div key={achievement.id} className="flex gap-3 p-3 border border-muted/20 bg-black/30 opacity-60">
                        <div className="w-10 h-10 shrink-0 flex items-center justify-center border-2 border-[#39404e] text-[#667080]"><HelpCircle className="w-4 h-4" /></div>
                        <div><div className="font-arcade text-[10px] text-[#7a8291]">???</div><p className="font-tech text-xs text-muted-foreground mt-1">Hidden badge.</p></div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={achievement.id}
                      className={`flex gap-3 p-3 border ${isUnlocked ? "bg-card/70" : "bg-black/20 border-muted/20 opacity-55"}`}
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
                        <div className="font-arcade text-[10px] tracking-wide" style={{ color: isUnlocked ? achievement.color : "#7a8291" }}>{achievement.label}</div>
                        <p className="font-tech text-xs text-muted-foreground mt-1 leading-snug">{achievement.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="border border-muted/30 bg-card/40 p-3">
      <div className="font-tech text-[10px] text-muted-foreground tracking-widest inline-flex items-center gap-1">{icon}{label}</div>
      <div className={`font-arcade text-sm mt-2 ${color}`}>{value}</div>
    </div>
  );
}
