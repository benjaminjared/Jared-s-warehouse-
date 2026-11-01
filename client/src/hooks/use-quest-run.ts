import { useCallback, useRef, useState } from "react";
import { advanceQuestProgress, type QuestRunStats, type RankQuest } from "@/lib/rank-quests";
import { useToast } from "@/hooks/use-toast";

/** Run-local only: no rewards or multiplayer state enter this tracker. */
export function useQuestRun() {
  const [quests, setQuests] = useState<RankQuest[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const current = useRef<{ quests: RankQuest[]; progress: Record<string, number> }>({ quests: [], progress: {} });
  const { toast } = useToast();

  const begin = useCallback((next: RankQuest[]) => {
    const snapshot = next.map(quest => ({ ...quest }));
    current.current = { quests: snapshot, progress: {} };
    setQuests(snapshot);
    setProgress({});
  }, []);

  const clear = useCallback(() => {
    current.current = { quests: [], progress: {} };
    setQuests([]);
    setProgress({});
  }, []);

  const report = useCallback((stats: QuestRunStats) => {
    const run = current.current;
    if (!run.quests.length) return;
    const next = advanceQuestProgress(run.quests, stats, run.progress);
    if (run.quests.every(quest => next[quest.id] === run.progress[quest.id])) return;
    const completed = run.quests.filter(quest => next[quest.id] >= quest.target && (run.progress[quest.id] ?? 0) < quest.target);
    current.current = { quests: run.quests, progress: next };
    setProgress(next);
    if (completed.length) {
      const main = run.quests.filter(quest => quest.category === "main");
      const mainJustCleared = completed.some(quest => quest.category === "main") && main.every(quest => next[quest.id] >= quest.target);
      toast({
        title: mainJustCleared ? "BETA QUEST SET CLEARED!" : completed.every(quest => quest.category === "bonus") ? "BONUS QUEST COMPLETE!" : "BETA QUEST COMPLETE!",
        description: mainJustCleared ? "All 3 main goals done. Keep running for your optional bonus!" : completed.map(quest => quest.title).join(" + "),
      });
    }
  }, [toast]);

  return { quests, progress, begin, clear, report };
}