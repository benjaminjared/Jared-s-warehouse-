import {
  CheckCircle2,
  Cpu,
  Disc3,
  MoveRight,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react";
import { formatQuestGoal, type RankQuest } from "@/lib/rank-quests";

interface RankQuestCardProps {
  quest: RankQuest;
  progress?: number;
  compact?: boolean;
  result?: boolean;
}

const metricDetails = {
  distance: { label: "METERS", Icon: MoveRight },
  cores: { label: "CUDA CORES", Icon: Cpu },
  score: { label: "POINTS", Icon: Trophy },
  flops: { label: "FLOPS", Icon: Sparkles },
  rareCds: { label: "RARE CD", Icon: Disc3 },
  pcBuildFast: { label: "FAST BUILD", Icon: Timer },
} as const;

export function RankQuestCard({ quest, progress = 0, compact = false, result = false }: RankQuestCardProps) {
  const safeProgress = Math.max(0, Math.floor(progress));
  const complete = safeProgress >= quest.target;
  const percent = Math.min(100, (safeProgress / quest.target) * 100);
  const isBonus = quest.category === "bonus";
  const { Icon, label } = metricDetails[quest.metric];
  const current = Math.min(safeProgress, quest.target);

  return (
    <section
      className={[
        "relative w-full overflow-hidden border-2 pixel-frame",
        complete
          ? "border-green-400/70 bg-green-400/10"
          : isBonus
            ? "border-amber-300/55 bg-amber-300/[0.06]"
            : "border-primary/55 bg-primary/[0.055]",
        compact ? "p-3" : "p-4",
      ].join(" ")}
      data-testid="rank-quest-card"
    >
      <div className={`absolute right-0 top-0 border-b border-l px-2 py-1 font-tech text-[8px] tracking-[0.16em] ${
        complete ? "border-green-400/30 text-green-300" : isBonus ? "border-amber-300/30 text-amber-200" : "border-primary/30 text-primary"
      }`}>
        {complete ? "LOGGED" : isBonus ? "OPTIONAL" : quest.difficulty}
      </div>
      <div className="flex items-start gap-3 pr-10">
        <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center border ${
          complete ? "border-green-400/60 text-green-300" : isBonus ? "border-amber-300/55 text-amber-200" : "border-primary/60 text-primary"
        }`}>
          {complete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`font-arcade text-[8px] tracking-widest ${isBonus ? "text-amber-200" : "text-primary"}`}>
              {isBonus ? "BONUS JOB" : "MAIN JOB"}
            </span>
            <span className="font-tech text-[9px] tracking-widest" style={{ color: quest.rankColor }}>
              {quest.rankLabel}
            </span>
          </div>
          <h3 className={`font-arcade ${compact ? "text-[10px]" : "text-xs"} mt-1 tracking-wider text-foreground`}>
            {quest.title}
          </h3>
          {!compact && <p className="mt-1 font-tech text-[10px] leading-snug tracking-wide text-muted-foreground">{quest.description}</p>}
          <p className={`mt-2 font-tech text-[10px] tracking-wide ${complete ? "text-green-300" : isBonus ? "text-amber-100" : "text-primary"}`}>
            {formatQuestGoal(quest)}
          </p>
          <div
            className="mt-2 h-2.5 border border-primary/30 bg-black/40"
            role="progressbar"
            aria-label={`${quest.title}: ${current.toLocaleString()} of ${quest.target.toLocaleString()} ${label}`}
            aria-valuemin={0}
            aria-valuemax={quest.target}
            aria-valuenow={current}
          >
            <div className={`h-full transition-transform duration-300 origin-left ${complete ? "bg-green-400" : isBonus ? "bg-amber-300" : "bg-primary"}`} style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
          <div className="mt-1 flex justify-between font-tech text-[10px] tabular-nums">
            <span className={complete ? "text-green-300" : isBonus ? "text-amber-200" : "text-primary"}>{current.toLocaleString()} / {quest.target.toLocaleString()}</span>
            <span className="text-muted-foreground">{complete && result ? "COMPLETE" : label}</span>
          </div>
        </div>
      </div>
    </section>
  );
}