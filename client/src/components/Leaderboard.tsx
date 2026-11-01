import { useHighScores } from "@/hooks/use-high-scores";
import { Trophy, RefreshCw, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { RankBadge } from "@/components/RankBadge";

const RANK_STYLES = [
  { label: "#1", className: "text-accent text-glow font-arcade", bar: "bg-accent" },
  { label: "#2", className: "text-zinc-300 font-arcade", bar: "bg-zinc-300" },
  { label: "#3", className: "text-amber-700 font-arcade", bar: "bg-amber-700" },
];

function formatCores(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function Leaderboard() {
  const { data: scores, isLoading, isError, refetch } = useHighScores(10);
  const topCores = scores && scores.length > 0 ? scores[0].cudaCoresCollected : 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="neon-box-gold w-full bg-background/80 backdrop-blur-sm overflow-hidden"
    >
      <div className="flex justify-between items-center px-6 py-4 border-b border-accent/30 bg-accent/5">
        <h2 className="font-arcade text-lg text-accent text-glow flex items-center gap-3">
          <Trophy className="w-5 h-5" />
          TOP EXECUTIVES
          <span className="blink text-accent/60 text-sm">_</span>
        </h2>
        <button onClick={() => refetch()} className="text-muted-foreground hover:text-accent transition-colors p-1" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3">
        {isLoading ? (
          <div className="text-center py-10 font-arcade text-xs text-secondary animate-pulse tracking-widest">LOADING DATA...</div>
        ) : isError ? (
          <div className="text-center py-10 font-arcade text-xs text-destructive tracking-widest">CONNECTION ERROR</div>
        ) : scores && scores.length > 0 ? (
          <div className="divide-y divide-muted/30">
            {scores.map((score, idx) => {
              const rankStyle = RANK_STYLES[idx] ?? { label: `#${idx + 1}`, className: "text-muted-foreground font-tech text-sm", bar: "bg-muted-foreground" };
              const barWidth = Math.max(4, Math.round((score.cudaCoresCollected / topCores) * 100));
              return (
                <motion.div
                  key={score.id}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * idx }}
                  className="py-3 px-2 hover:bg-muted/20 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 text-right flex-shrink-0 ${rankStyle.className}`}>{rankStyle.label}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {score.userId ? (
                          <Link
                            href={`/player/${score.userId}`}
                            className="font-tech font-bold text-foreground uppercase tracking-widest truncate text-base hover:text-primary hover:underline underline-offset-4 transition-colors inline-flex items-center gap-1.5"
                            data-testid={`link-player-${score.userId}`}
                          >
                            {score.playerName}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity" />
                          </Link>
                        ) : (
                          <span className="font-tech font-bold text-foreground/70 uppercase tracking-widest truncate text-base" title="Legacy entry — no account page">
                            {score.playerName}
                          </span>
                        )}
                        <RankBadge rank={score.rank} />
                      </div>
                      <div className="mt-1 h-1 w-full bg-muted/30 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ delay: 0.1 * idx + 0.3, duration: 0.6 }}
                          className={`h-full ${rankStyle.bar} opacity-60`}
                        />
                      </div>
                    </div>
                    <div className="font-arcade text-sm text-primary text-right flex-shrink-0 min-w-[60px]">
                      {formatCores(score.cudaCoresCollected)}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 font-arcade text-xs text-muted-foreground tracking-widest">
            NO RECORDS YET<br />
            <span className="text-secondary/60 text-xs mt-2 block">BE THE FIRST</span>
          </div>
        )}
      </div>

      <div className="px-6 py-2 border-t border-muted/20 bg-card/20 flex justify-between items-center">
        <span className="font-tech text-xs text-muted-foreground/50">GLOBAL RANKINGS — CUDA CORES — CLICK A NAME FOR THEIR PAGE</span>
        <span className="font-tech text-xs text-muted-foreground/50">{scores?.length ?? 0} ENTRIES</span>
      </div>
    </motion.div>
  );
}
