export const RACE_TARGET_DISTANCE = null;

export interface RacePlayer {
  id: number;
  username: string;
  skin: string;
  isHost: boolean;
  ready: boolean;
  distance: number;
  cores: number;
  lives: number;
  alive: boolean;
  finished: boolean;
  finishOrder: number | null;
  place: number | null;
  connected: boolean;
}

export interface RaceChatMessage {
  id: string;
  userId: number;
  username: string;
  text?: string;
  emoteId?: string;
  timestamp: number;
}

export interface RaceRoomState {
  code: string;
  status: "lobby" | "countdown" | "racing" | "finished";
  hostId: number;
  targetDistance: number | null;
  startAt: number | null;
  players: RacePlayer[];
  standings: RacePlayer[];
  messages: RaceChatMessage[];
}

export type RaceClientMessage =
  | { type: "create"; token: string }
  | { type: "join"; token: string; code: string }
  | { type: "ready"; ready: boolean }
  | { type: "start" }
  | { type: "progress"; distance: number; cores: number }
  | { type: "hit"; distance: number; cores: number }
  | { type: "dead"; distance: number; cores: number }
  | { type: "kick"; targetUserId: number }
  | { type: "ban"; targetUserId: number }
  | { type: "leave" }
  | { type: "rematch" }
  | { type: "chat"; text: string }
  | { type: "emote"; emoteId: string };

export type RaceServerMessage =
  | { type: "welcome"; userId: number }
  | { type: "room"; room: RaceRoomState }
  | { type: "chat"; message: RaceChatMessage }
  | { type: "removed"; banned: boolean }
  | { type: "error"; message: string }
  | { type: "left" };