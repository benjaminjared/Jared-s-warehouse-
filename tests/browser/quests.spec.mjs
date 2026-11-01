import { test, expect } from "@playwright/test";

async function captureEngine(page) {
  await page.evaluate(async () => {
    const { GameEngine } = await import("/src/lib/game-engine.ts");
    const start = GameEngine.prototype.startGame;
    GameEngine.prototype.startGame = function (opts) {
      window.__questTestEngine = this;
      return start.call(this, opts);
    };
  });
}

test("quest rotation, live completion, checkpoint latch, game-over summary and next run", async ({ page }, info) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  const board = page.getByTestId("rank-quest-board");
  await expect(board.getByTestId("rank-quest-card")).toHaveCount(4);
  await board.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("quest-preview.png") });
  const firstTitles = await board.locator("h3").allTextContents();
  await board.getByRole("button", { name: "NEW QUESTS" }).click();
  const nextTitles = await board.locator("h3").allTextContents();
  expect(nextTitles).not.toEqual(firstTitles);
  await captureEngine(page);
  await page.getByRole("button", { name: "START DASH", exact: true }).click();
  await expect(board.locator("h3")).toHaveText(nextTitles);
  await expect(page.getByRole("button", { name: "NEW QUESTS" })).toHaveCount(0);
  await page.evaluate(() => {
    const engine = window.__questTestEngine;
    engine.pause();
    engine.distance = 100000; engine.cudaCores = 100000;
    engine.score = 10000000; engine.flopsCollected = 100;
  });
  await expect(board).toContainText("MAIN SET CLEARED");
  const canvasBox = await page.locator("canvas").boundingBox();
  const boardBox = await board.boundingBox();
  expect(boardBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height);
  await page.evaluate(() => {
    const engine = window.__questTestEngine;
    engine.distance = 0; engine.cudaCores = 0; engine.score = 0;
    engine.flopsCollected = 0; engine.pcBuildFast = true;
  });
  await expect(board).toContainText("FULL SET CLEARED");
  await page.screenshot({ path: info.outputPath("quest-completed.png"), fullPage: true });
  await page.evaluate(() => window.__questTestEngine.gameOver());
  await expect(page.getByText("GAME OVER", { exact: true })).toBeVisible();
  await expect(board).toContainText("FULL SET CLEARED");
  await page.getByRole("button", { name: "PLAY AGAIN" }).click();
  await expect(board).toContainText("0/3 MAIN JOBS");
  expect(await board.locator("h3").allTextContents()).not.toEqual(nextTitles);
  await page.getByRole("button", { name: "EXIT RUN" }).click();
  await expect(page.getByRole("button", { name: "NEW QUESTS" })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [320, 390]) {
  test(`quest board and results remain usable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    const board = page.getByTestId("rank-quest-board");
    await board.scrollIntoViewIfNeeded();
    await expect(board).toBeVisible();
    const box = await board.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    // Every title must fit rather than disappearing behind overflow:hidden.
    for (const title of await board.locator("h3").all()) {
      expect(await title.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy();
    }
    await board.getByRole("button", { name: "HOW BETA QUESTS WORK" }).click();
    await expect(board).toContainText("do not award coins");
    await page.screenshot({ path: info.outputPath(`quests-${width}.png`), fullPage: true });
    await captureEngine(page);
    await page.getByRole("button", { name: "START DASH", exact: true }).click();
    await page.evaluate(() => window.__questTestEngine.gameOver());
    await expect(page.getByText("GAME OVER", { exact: true })).toBeVisible();
    await board.scrollIntoViewIfNeeded();
    await expect(board).toContainText("0/3 MAIN JOBS COMPLETE");
    await page.getByRole("button", { name: "PLAY AGAIN" }).click();
    await expect(page.getByRole("button", { name: "EXIT RUN" })).toBeVisible();
  });
}

test("rank loads before a run, snapshots correctly, and multiplayer has no quests", async ({ page }) => {
  const profile = { id: 9999, username: "QUEST_FIXTURE", role: "player", equippedSkin: "default", achievements: [], ownedSkins: ["default"], cudaCoins: 0, revives: 0 };
  const rank = { id: "diamond", label: "DIAMOND", color: "#8ff4ff", position: null, nextMinCores: 12000 };
  await page.addInitScript(profile => localStorage.setItem("wh3_auth", JSON.stringify({ token: "browser-fixture", profile })), profile);
  await page.route("**/api/auth/me", route => route.fulfill({ json: { profile } }));
  await page.route("**/api/high-scores*", route => route.fulfill({ json: [] }));
  let releaseRank;
  const gate = new Promise(resolve => { releaseRank = resolve; });
  await page.route("**/api/players/9999", async route => {
    await gate;
    await route.fulfill({ json: { ...profile, rank, bestCores: 9000 } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "START DASH", exact: true })).toBeDisabled();
  releaseRank();
  const board = page.getByTestId("rank-quest-board");
  await expect(board).toContainText("DIAMOND");
  await captureEngine(page);
  await page.getByRole("button", { name: "START DASH", exact: true }).click();
  await expect(board).toContainText("DIAMOND");
  await page.getByRole("button", { name: "EXIT RUN" }).click();
  await page.routeWebSocket("**/ws/race", ws => {
    const player = { id: profile.id, username: profile.username, skin: "default", isHost: true, ready: true, distance: 0, cores: 0, lives: 3, alive: true, finished: false, finishOrder: null, place: null, connected: true };
    const room = { code: "ABCD", status: "lobby", hostId: player.id, targetDistance: null, startAt: null, players: [player, { ...player, id: 9998, username: "OTHER", isHost: false }], standings: [] };
    ws.onMessage(raw => {
      const message = JSON.parse(raw);
      if (message.type === "create") {
        ws.send(JSON.stringify({ type: "welcome", userId: player.id }));
        ws.send(JSON.stringify({ type: "room", room }));
      }
      if (message.type === "start") ws.send(JSON.stringify({ type: "room", room: { ...room, status: "racing" } }));
    });
  });
  await page.getByTestId("button-multiplayer-race").click();
  await page.getByRole("button", { name: "OPEN LOBBY" }).click();
  await page.getByRole("button", { name: "START RACE" }).click();
  await expect(page.getByRole("button", { name: "EXIT RUN" })).toBeVisible();
  await expect(board).toHaveCount(0);
  expect(await page.evaluate(() => window.__questTestEngine.raceLivesRemaining)).toBe(3);
});