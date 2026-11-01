import { RANK_TIERS, getRank, type RankInfo } from "@shared/schema";

export type RankQuest = {
  id: string;
  rankLabel: string;
  rankColor: string;
  title: string;
  metric: "distance" | "cores" | "score" | "flops" | "rareCds" | "pcBuildFast";
  target: number;
  description: string;
  difficulty: "STANDARD" | "HARD" | "BONUS";
  category: "main" | "bonus";
};

export type QuestRunStats = {
  distance: number;
  cudaCores: number;
  score?: number;
  flopsCollected?: number;
  rareCds?: number;
  pcBuildFast?: boolean;
};

type QuestTemplate = Pick<RankQuest, "title" | "metric" | "description" | "difficulty"> & { multiplier: number };

const distanceQuests: QuestTemplate[] = [
  { title: "AISLE EXPLORER", metric: "distance", multiplier: 1, difficulty: "STANDARD", description: "Clock up a solid shift through the warehouse." },
  { title: "LONG HAUL", metric: "distance", multiplier: 1.25, difficulty: "HARD", description: "Push a little further than your usual delivery route." },
  { title: "OVERTIME RUNNER", metric: "distance", multiplier: 1.5, difficulty: "HARD", description: "Keep the shift going. Every meter counts." },
];
const coreQuests: QuestTemplate[] = [
  { title: "CORE COLLECTOR", metric: "cores", multiplier: 0.8, difficulty: "STANDARD", description: "Sweep up CUDA cores on your way through the aisles." },
  { title: "GPU PAYLOAD", metric: "cores", multiplier: 1, difficulty: "STANDARD", description: "Deliver a rank-sized batch of processing power." },
  { title: "CUDA OVERDRIVE", metric: "cores", multiplier: 1.25, difficulty: "HARD", description: "Hunt the pickups and exceed your output quota." },
];
const specialistQuests: QuestTemplate[] = [
  { title: "FLOPS HUNTER", metric: "flops", multiplier: 1, difficulty: "STANDARD", description: "Find and collect the special FLOPS pickups." },
  { title: "SCORE ATTACK", metric: "score", multiplier: 1, difficulty: "STANDARD", description: "Combine distance and CUDA cores for a big score." },
  { title: "PICKUP PATROL", metric: "flops", multiplier: 1.5, difficulty: "HARD", description: "Take the scenic route through more FLOPS pickups." },
  { title: "HIGH-SCORE SHIFT", metric: "score", multiplier: 1.4, difficulty: "HARD", description: "Make this shift count with an ambitious total score." },
];
const bonusQuests: QuestTemplate[] = [
  { title: "RUNBUN'S WISHLIST", metric: "rareCds", multiplier: 1, difficulty: "BONUS", description: "Find one Rare CD. A lucky extra, never required for the main set." },
  { title: "SPEED BUILDER", metric: "pcBuildFast", multiplier: 1, difficulty: "BONUS", description: "Finish the PC-building work order in under 55 seconds." },
  { title: "EXTRA MILE", metric: "distance", multiplier: 2, difficulty: "BONUS", description: "Still going? Double the standard distance for your rank." },
  { title: "FLOPS FRENZY", metric: "flops", multiplier: 2, difficulty: "BONUS", description: "Collect twice your rank's normal FLOPS quota." },
];

export const QUEST_TEMPLATE_COUNT = 14;
const CORE_TARGETS = [100, 200, 400, 700, 1000, 1400, 2000, 2800, 4000, 6000, 9000, 14000, 18000, 22000, 26000];

/** Snapshot these at run start: a rank change must never move a goal mid-run. */
export function getRankQuests(rank?: RankInfo | null, rotation = 0): RankQuest[] {
  const activeRank = rank ?? getRank(0, null);
  const level = activeRank.position !== null && activeRank.position >= 1 && activeRank.position <= 3
    ? 15 - activeRank.position
    : Math.max(0, RANK_TIERS.findIndex(tier => tier.id === activeRank.id));
  const index = Math.max(0, Math.floor(Number.isFinite(rotation) ? rotation : 0));
  const base = {
    distance: 500 + level * 250,
    cores: CORE_TARGETS[level],
    flops: 2 + level * 2,
    score: (500 + level * 250) * 10 + CORE_TARGETS[level],
    rareCds: 1,
    pcBuildFast: 1,
  };
  const templates = [
    distanceQuests[index % distanceQuests.length],
    coreQuests[index % coreQuests.length],
    specialistQuests[index % specialistQuests.length],
    bonusQuests[index % bonusQuests.length],
  ];
  return templates.map((template, slot) => ({
    ...template,
    id: `${activeRank.id}:${template.title}`,
    rankLabel: activeRank.label,
    rankColor: activeRank.color,
    category: slot === 3 ? "bonus" : "main",
    target: Math.ceil(base[template.metric] * template.multiplier),
  }));
}

export function getQuestProgress(quest: RankQuest, stats: QuestRunStats): number {
  const values = {
    distance: stats.distance, cores: stats.cudaCores, score: stats.score,
    flops: stats.flopsCollected, rareCds: stats.rareCds, pcBuildFast: stats.pcBuildFast ? 1 : 0,
  };
  const value = values[quest.metric] ?? 0;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Progress latches so a checkpoint rewind cannot undo an earned completion. */
export function advanceQuestProgress(quests: RankQuest[], stats: QuestRunStats, previous: Record<string, number> = {}): Record<string, number> {
  return Object.fromEntries(quests.map(quest => [
    quest.id,
    Math.min(quest.target, Math.max(previous[quest.id] ?? 0, getQuestProgress(quest, stats))),
  ]));
}

export function formatQuestGoal(quest: RankQuest): string {
  const target = quest.target.toLocaleString();
  switch (quest.metric) {
    case "distance": return `REACH ${target}M`;
    case "cores": return `COLLECT ${target} CUDA CORES`;
    case "score": return `SCORE ${target} POINTS`;
    case "flops": return `COLLECT ${target} FLOPS PICKUPS`;
    case "rareCds": return "FIND A RARE CD";
    case "pcBuildFast": return "BUILD A PC IN UNDER 55 SECONDS";
  }
}