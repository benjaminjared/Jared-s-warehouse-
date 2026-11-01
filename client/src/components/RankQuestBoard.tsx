import { useState } from "react";
import { Boxes, ChevronDown, ChevronUp, RefreshCw, ShieldCheck, Target } from "lucide-react";
import { RankQuestCard } from "@/components/RankQuestCard";
import type { RankQuest } from "@/lib/rank-quests";

export interface RankQuestBoardProps {
  quests: RankQuest[];
  progress?: Record<string, number>;
  mode?: "preview" | "live" | "result";
  onShuffle?: () => void;
}

export function RankQuestBoard({
  quests,
  progress = {},
  mode = "preview",
  onShuffle,
}: RankQuestBoardProps) {
  const [expanded, setExpanded] = useState(false);
  const [liveExpanded, setLiveExpanded] = useState(false);
  const mainQuests = quests.filter((quest) => quest.category === "main").slice(0, 3);
  const bonusQuest = quests.find((quest) => quest.category === "bonus");
  const mainComplete = mainQuests.filter((quest) => (progress[quest.id] ?? 0) >= quest.target).length;
  const bonusComplete = bonusQuest ? (progress[bonusQuest.id] ?? 0) >= bonusQuest.target : false;
  const mainCleared = mainQuests.length === 3 && mainComplete === 3;
  const allCleared = mainCleared && (!bonusQuest || bonusComplete);
  const isResult = mode === "result";

  const status = allCleared
    ? "FULL SET CLEARED"
    : mainCleared
      ? bonusQuest ? "MAIN SET CLEARED · BONUS OPEN" : "MAIN SET CLEARED"
      : isResult ? `${mainComplete}/3 MAIN JOBS COMPLETE` : `${mainComplete}/3 MAIN JOBS LOGGED`;

  return (
    <aside className={`w-full border-2 border-primary/55 bg-card/80 pixel-frame ${mode === "live" ? "p-2" : "p-4 sm:p-5"}`} data-testid="rank-quest-board">
      {mode === "live" && (
        <button
          type="button"
          onClick={() => setLiveExpanded((value) => !value)}
          className="flex min-h-10 w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-expanded={liveExpanded}
          aria-controls="live-rank-quest-details"
          aria-label={liveExpanded ? "Hide run quests" : "Show run quests"}
          data-testid="live-quest-toggle"
        >
          <Target className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="font-arcade text-[9px] tracking-wider text-foreground">RUN QUESTS</span>
          <span className="border border-primary/35 bg-black/30 px-2 py-1 font-tech text-[10px] text-primary whitespace-nowrap">
            {mainComplete}/3 MAIN
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1" aria-hidden="true">
            {mainQuests.map((quest) => {
              const current = Math.min(progress[quest.id] ?? 0, quest.target);
              const percent = Math.min(100, (current / quest.target) * 100);
              const complete = current >= quest.target;
              return (
                <span key={quest.id} className="h-1.5 w-5 overflow-hidden border border-primary/35 bg-black/40">
                  <span
                    className={`block h-full ${complete ? "bg-green-400" : "bg-primary"}`}
                    style={{ width: `${percent}%` }}
                  />
                </span>
              );
            })}
            {bonusQuest && <span className="hidden font-tech text-[9px] text-amber-200 sm:inline">+ BONUS</span>}
            {liveExpanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
          </span>
        </button>
      )}

      <div
        id={mode === "live" ? "live-rank-quest-details" : undefined}
        className={`${mode === "live" ? "pt-3" : ""} ${mode === "live" && !liveExpanded ? "hidden" : ""}`}
      >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/25 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="border border-primary bg-primary px-2 py-1 font-arcade text-[9px] tracking-[0.18em] text-primary-foreground">BETA</span>
            <span className="font-tech text-[10px] tracking-[0.16em] text-muted-foreground">RUN ORDERS // {mode.toUpperCase()}</span>
          </div>
          <h2 className="mt-2 font-arcade text-sm tracking-wider text-foreground">RANK QUEST BOARD</h2>
          <p className="mt-1 font-tech text-[10px] tracking-wide text-muted-foreground">Rank: <span className="text-foreground">{mainQuests[0]?.rankLabel ?? "UNASSIGNED"}</span></p>
        </div>
        <div className={`shrink-0 border px-2.5 py-2 text-right ${allCleared ? "border-green-400/60 bg-green-400/10" : mainCleared ? "border-primary/60 bg-primary/10" : "border-primary/30 bg-black/20"}`}>
          <div className={`font-arcade text-[10px] tracking-wider ${allCleared ? "text-green-300" : "text-primary"}`}>{status}</div>
          <div className="mt-1 font-tech text-[9px] tracking-wider text-muted-foreground">
            {bonusQuest ? `BONUS: ${bonusComplete ? "COMPLETE" : "OPEN"}` : "NO BONUS ASSIGNED"}
          </div>
        </div>
      </header>

      {quests.length === 0 ? (
        <div className="grid min-h-36 place-items-center border border-dashed border-primary/35 p-5 text-center">
          <div>
            <Boxes className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
            <p className="mt-2 font-arcade text-[10px] tracking-wider text-foreground">ORDERS ARE LOADING</p>
            <p className="mt-1 font-tech text-[10px] text-muted-foreground">The shift dispatcher has no set to display.</p>
          </div>
        </div>
      ) : (
        <>
          <div className={`mt-4 grid grid-cols-1 gap-3 ${mode === "live" ? "lg:grid-cols-3" : "md:grid-cols-3"}`}>
            {mainQuests.map((quest) => <RankQuestCard key={quest.id} quest={quest} progress={progress[quest.id]} compact={mode === "live"} result={isResult} />)}
          </div>

          {bonusQuest && (
            <div className="mt-3">
              <div className="mb-2 flex items-center gap-2 font-tech text-[9px] tracking-[0.15em] text-amber-200">
                <Target className="h-3.5 w-3.5" aria-hidden="true" /> OPTIONAL SIDE JOB — NOT NEEDED FOR MAIN SET
              </div>
              <RankQuestCard quest={bonusQuest} progress={progress[bonusQuest.id]} compact={mode === "live"} result={isResult} />
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-primary/25 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-11 items-center gap-2 self-start font-tech text-[10px] tracking-[0.12em] text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-expanded={expanded}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          HOW BETA QUESTS WORK
          {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
        {mode === "preview" && onShuffle && (
          <button
            type="button"
            onClick={onShuffle}
            className="flex min-h-11 items-center justify-center gap-2 border-2 border-primary bg-primary px-4 font-arcade text-[10px] tracking-wider text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> NEW QUESTS
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-2 border border-primary/25 bg-black/20 p-3 font-tech text-[10px] leading-relaxed tracking-wide text-muted-foreground">
          Your three main goals last for this run. The optional side job is extra credit; clear it for a full set, but it never blocks the main set. The next run receives a new quest set. <span className="text-foreground">BETA note: quests do not award coins.</span>
      </div>
      )}
      </div>
    </aside>
  );
}

export default RankQuestBoard;