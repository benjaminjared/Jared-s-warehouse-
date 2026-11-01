# Jared's Warehouse: Race Lobby Chat & Mystery Skin Cases

A focused expansion bringing real-time social interaction (chat and arcade emotes) to the multiplayer Race Lobby, alongside a high-stakes 45-coin Mystery Skin Case system in Jeff's Shop featuring tiered odds (60% Common, 25% Rare, 13% Epic, 2% Legendary Animated) with an arcade crate-opening reveal.

## User Review & Critical Decisions

> [!IMPORTANT]
> The previous proposed sorting minigame and run consumables have been completely removed per your request. The scope is now strictly focused on **Race Lobby Chat & Emotes** and **45-Coin Skin Cases**.

- **Calibrated Case Odds (Total: 100%)**:
  - **Common (Normal)**: 60%
  - **Rare**: 25%
  - **Epic**: 13%
  - **Legendary (Animated)**: 2%
- **Case Pricing**: Exactly 45 CUDA coins per case.
- **Duplicate Protection / Value**: If a player pulls a skin they already own, they receive a 20 CUDA coin refund as "scrap recycling," ensuring openings never feel wasted.
- **Lobby Social Protocol**: Fast real-time WebSocket messaging for both quick-tap retro emotes and custom typed chat messages in the race room.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Mystery Skin Cases**: Players can spend 45 CUDA coins in Jeff's Shop to spin an arcade Mystery Case. An animated reel decelerates and reveals a skin categorized by rarity, accompanied by neon particle effects.
  2. **Race Lobby Chat & Emotes**: Racers assembled in multiplayer rooms can send text messages and tap arcade emote badges (e.g., 👋 Wave, ⚡ Overclock, 🏎️ Vroom, 💀 Wrecked, 🔥 Let's Go) that float above their player cards and appear in an in-lobby log.
- **Target Experience**: Gives competitive players a fun way to socialize and banter prior to starting warehouse dashes, while giving coin earners an exciting, fair gacha chase for rare and legendary animated skins.

---

## 2. User Experience & Visual Design

### Skin Case Unboxing Flow (Jeff's Shop)
1. In **Jeff's Shop**, a dedicated **"CRATES & CASES"** arcade machine tab stands out with glowing marquee lights (`neon-box-pink` and phosphor accents).
2. Displays the exact verified odds breakdown modal clearly for 100% transparency:
   - 🟩 **Common (60%)**
   - 🟦 **Rare (25%)**
   - 🟪 **Epic (13%)**
   - 🟨 **Legendary Animated (2%)**
3. Tapping **"OPEN CASE (45 COINS)"** verifies sufficient balance, deducts 45 coins, and triggers an authentic retro slot-reel animation spinning through potential skins.
4. The reel slows down with clicking sound effects, snapping onto the winning item with glowing neon bursts matching its rarity tier.
5. Displays **"EQUIP NOW"** and **"DONE"** buttons. If already owned, displays **"DUPLICATE RECYCLED: +20 COINS"**.

### Race Lobby Chat & Emotes Flow
1. While connected to a room in the **Multiplayer Race Lobby**, players see a docked chat panel and an emote quick-bar alongside the player roster.
2. **Emote Quick-Bar**: 6 expressive arcade pixel emote buttons:
   - 👋 `WAVE`
   - 🔥 `FIRE`
   - ⚡ `VOLT`
   - 🏎️ `SPEED`
   - 💀 `DEAD`
   - 🏆 `CHAMP`
3. Tapping an emote immediately pops an animated speech bubble above that player's avatar card for everyone in the room and logs it in the lobby activity stream.
4. **Text Chat**: An arcade command-style input line (`$> Say something...`) with rate-limiting and character caps (max 80 chars), ensuring clean, responsive banter.

---

## 3. Key Product Decisions & Trade-Offs

- **Case Odds & Rarity Balance**:
  - *Chosen Distribution*: 60% Common, 25% Rare, 13% Epic, 2% Legendary.
  - *Why*: Perfectly aligns with the requested 2% Legendary rate while creating a satisfying progression curve across Rare and Epic tiers without diluting value.
- **Roster Expansion**:
  - *Skins*: Maintains all existing legacy skins (`default`, `cuda_blue`, `rgb_runner`, `shipping_gold`, `night_shift`, `redacted`), while introducing fresh thematic skins across tiers (e.g., Common *Forklift Yellow*, Rare *Liquid Coolant*, Epic *Overclocked Amethyst*, and Legendary *Quantum Holo* with chromatic animated shifting).
- **Multiplayer Messaging Architecture**:
  - *Approach*: Extend existing WebSocket connection in `server/race.ts` with `chat` and `emote` event types rather than introducing external polling or secondary connections.
  - *Why*: Instant zero-latency delivery, zero new dependencies, and seamlessly leverages existing room isolation.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────┐
│                      Client UI                         │
│                                                        │
│  ┌───────────────────────┐   ┌──────────────────────┐  │
│  │   Jeff's Shop (Cases) │   │   Race Lobby Chat    │  │
│  │  - 45 Coin Case Card  │   │  - Emote Quick Bar   │  │
│  │  - Unboxing Reel View │   │  - Live Message Log  │  │
│  │  - Rarity Odds HUD    │   │  - Player Card Popups│  │
│  └──────────┬────────────┘   └──────────┬───────────┘  │
└─────────────┼───────────────────────────┼──────────────┘
              │ POST /api/shop/open-case  │ WebSocket
              ▼                           ▼
┌───────────────────────────┐   ┌────────────────────────┐
│     Express API Server    │   │  WebSocket Race Server │
│   (server/routes.ts)      │   │   (server/race.ts)     │
│  - Validates 45 Coins     │   │  - Broadcasts "chat"   │
│  - Rolls Odds (60/25/13/2)│   │  - Broadcasts "emote"  │
│  - Updates User Profile   │   │  - Keeps Room Activity │
└─────────────┬─────────────┘   └────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────────────┐
│               Storage (server/storage.ts)              │
│  - FileStorage / DatabaseStorage compatible            │
│  - Adds newly unlocked skin to `ownedSkins`            │
│  - Deducts 45 coins (or grants +20 on duplicate)       │
└────────────────────────────────────────────────────────┘
```

### Data Model & Messages

```typescript
// Shared Types (shared/schema.ts)
export type SkinRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface SkinDefinition {
  id: string;
  label: string;
  description: string;
  rarity: SkinRarity;
  cost: number;
  color: string;
  accent: string;
  animated: boolean;
  secret?: boolean;
}

// WebSocket Protocol Additions (shared/race.ts)
export type RaceClientMessage =
  | ...existing
  | { type: "chat"; text: string }
  | { type: "emote"; emoteId: string };

export type RaceServerMessage =
  | ...existing
  | { type: "chat"; message: { id: string; userId: number; username: string; text?: string; emoteId?: string; timestamp: number } };
```

---

## 5. Verification Plan

1. **Case Mechanics & Math Validation**:
   - Automated unit test verifying 10,000 simulated case rolls adhere to the exact 60% / 25% / 13% / 2% distribution bounds.
   - Verify balance validation (fails if coins < 45).
   - Verify duplicate pull gives 20 coins refund.
2. **Shop & Unboxing UI**:
   - Verify the case opening animation plays smoothly without UI freezing.
   - Verify newly unlocked skins can be equipped immediately and appear in-game and in player profiles.
3. **Multiplayer Chat & Emote Delivery**:
   - Connect multiple players to a race room.
   - Verify chat messages appear in real time for all room participants.
   - Verify emote bubbles trigger on the sender's avatar in the lobby.
   - Verify no messages leak across different room codes.
