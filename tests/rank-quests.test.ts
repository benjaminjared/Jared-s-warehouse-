import { test } from "node:test";
import assert from "node:assert/strict";
import { RANK_TIERS, TOP_RANKS, getRank } from "../shared/schema";
import { advanceQuestProgress, formatQuestGoal, getQuestProgress, getRankQuests, QUEST_TEMPLATE_COUNT } from "../client/src/lib/rank-quests";

test("guests get four Bronze I quests: three main and one optional bonus", () => {
  const quests = getRankQuests();
  assert.equal(quests.length, 4);
  assert.equal(quests.filter(q => q.category === "main").length, 3);
  assert.equal(quests.filter(q => q.category === "bonus").length, 1);
  assert(quests.every(q => q.rankLabel === "BRONZE I" && q.target > 0));
  assert.equal(new Set(quests.map(q => q.id)).size, 4);
});

test("rotation covers all 14 templates and six metrics without duplicates in a set", () => {
  const titles = new Set<string>();
  const metrics = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const set = getRankQuests(null, i);
    assert.equal(new Set(set.map(q => q.id)).size, 4);
    set.forEach(q => { titles.add(q.title); metrics.add(q.metric); assert(formatQuestGoal(q)); });
    assert.notDeepEqual(set, getRankQuests(null, i + 1));
  }
  assert.equal(titles.size, QUEST_TEMPLATE_COUNT);
  assert.equal(metrics.size, 6);
});

test("every normal tier and top-three title gets increasing distance/core/FLOPS targets", () => {
  const ranks = [...RANK_TIERS.map(tier => getRank(tier.minCores, null)), ...[3, 2, 1].map(position => getRank(0, position))];
  for (let i = 1; i < ranks.length; i++) {
    const prev = getRankQuests(ranks[i - 1]);
    const next = getRankQuests(ranks[i]);
    for (let j = 0; j < 3; j++) assert(next[j].target > prev[j].target);
    assert.equal(next[0].rankLabel, ranks[i].label);
  }
  TOP_RANKS.forEach(rank => assert.equal(getRankQuests(getRank(0, rank.position))[0].rankLabel, rank.label));
});

test("all goals map to actual run metrics, including fast PC builds and CDs", () => {
  const stats = { distance: 1200.8, cudaCores: 4200.9, score: 10000, flopsCollected: 9, rareCds: 1, pcBuildFast: true };
  const values = { distance: 1200, cores: 4200, score: 10000, flops: 9, rareCds: 1, pcBuildFast: 1 };
  for (let i = 0; i < 12; i++) {
    for (const quest of getRankQuests(null, i)) {
      assert.equal(getQuestProgress(quest, stats), values[quest.metric]);
      assert.equal(getQuestProgress(quest, { distance: -5, cudaCores: NaN }), 0);
    }
  }
});

test("completed quests latch over Lotus rewinds and repeated updates", () => {
  const quests = getRankQuests();
  const complete = advanceQuestProgress(quests, { distance: 100000, cudaCores: 100000, flopsCollected: 99, rareCds: 1 });
  for (const q of quests) assert.equal(complete[q.id], q.target);
  assert.deepEqual(advanceQuestProgress(quests, { distance: 0, cudaCores: 0 }, complete), complete);
  assert.deepEqual(advanceQuestProgress(quests, { distance: 100000, cudaCores: 100000, flopsCollected: 99, rareCds: 1 }, complete), complete);
});

test("new runs can reset progress, while preview changes cannot mutate a captured set", () => {
  const quests = getRankQuests();
  const snapshot = JSON.stringify(quests);
  getRankQuests(getRank(12000, null), 5);
  assert.equal(JSON.stringify(quests), snapshot);
  const reset = advanceQuestProgress(quests, { distance: 0, cudaCores: 0 });
  assert(Object.values(reset).every(progress => progress === 0));
});