import type { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import {
  RACE_TARGET_DISTANCE,
  type RaceClientMessage,
  type RacePlayer,
  type RaceRoomState,
  type RaceServerMessage,
} from "@shared/race";
import { resolveSessionToken } from "./routes";
import { storage } from "./storage";

type Room = RaceRoomState & {
  sockets: Map<number, WebSocket>;
  countdownTimer?: NodeJS.Timeout;
  safetyTimer?: NodeJS.Timeout;
  broadcastTimer?: NodeJS.Timeout;
  lastProgressBroadcast: number;
  bannedUserIds: Set<number>;
};

const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), token: z.string().min(1) }).strict(),
  z.object({ type: z.literal("join"), token: z.string().min(1), code: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{4}$/) }).strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("start") }).strict(),
  z.object({ type: z.literal("progress"), distance: z.number().finite(), cores: z.number().finite() }).strict(),
  z.object({ type: z.literal("hit"), distance: z.number().finite(), cores: z.number().finite() }).strict(),
  z.object({ type: z.literal("dead"), distance: z.number().finite(), cores: z.number().finite() }).strict(),
  z.object({ type: z.literal("kick"), targetUserId: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("ban"), targetUserId: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("leave") }).strict(),
  z.object({ type: z.literal("rematch") }).strict(),
  z.object({ type: z.literal("chat"), text: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("emote"), emoteId: z.string().min(1).max(30) }).strict(),
]);

const rooms = new Map<string, Room>();
const userRooms = new Map<number, Room>();
const socketUsers = new WeakMap<WebSocket, { userId: number; room: Room }>();
// Sockets with an authentication request in flight; blocks concurrent create/join on the same socket.
const authenticating = new WeakSet<WebSocket>();
const MAX_PAYLOAD_BYTES = 4 * 1024;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function send(socket: WebSocket, message: RaceServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function publicRoom(room: Room): RaceRoomState {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    targetDistance: room.targetDistance,
    startAt: room.startAt,
    players: room.players,
    standings: room.standings,
    messages: room.messages ?? [],
  };
}

function broadcast(room: Room) {
  const message: RaceServerMessage = { type: "room", room: publicRoom(room) };
  room.sockets.forEach(socket => send(socket, message));
}

function broadcastProgress(room: Room) {
  const wait = Math.max(0, 200 - (Date.now() - room.lastProgressBroadcast));
  if (wait === 0) {
    room.lastProgressBroadcast = Date.now();
    broadcast(room);
  } else if (!room.broadcastTimer) {
    room.broadcastTimer = setTimeout(() => {
      room.broadcastTimer = undefined;
      room.lastProgressBroadcast = Date.now();
      broadcast(room);
    }, wait);
  }
}

function finishRace(room: Room) {
  if (room.status === "finished") return;
  room.status = "finished";
  room.startAt = null;
  if (room.safetyTimer) clearTimeout(room.safetyTimer);
  const standings = [...room.players].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return (a.finishOrder ?? Infinity) - (b.finishOrder ?? Infinity);
    return b.distance - a.distance || b.cores - a.cores;
  });
  standings.forEach((player, index) => { player.place = index + 1; });
  room.standings = standings;
  broadcast(room);
}

function checkRaceEnd(room: Room) {
  if (room.status === "racing" && room.players.every(player => player.finished || !player.alive || !player.connected)) {
    finishRace(room);
  }
}

function beginRace(room: Room) {
  if (room.status !== "countdown") return;
  room.status = "racing";
  room.startAt = null;
  broadcast(room);
  checkRaceEnd(room);
  if (room.status === "racing") {
    room.safetyTimer = setTimeout(() => finishRace(room), 3 * 60 * 1000);
  }
}

function makeCode() {
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function updateStats(player: RacePlayer, distance: number, cores: number) {
  player.distance = Math.max(player.distance, Math.max(0, distance));
  player.cores = Math.max(0, cores);
}

function destroyRoom(room: Room) {
  if (room.countdownTimer) clearTimeout(room.countdownTimer);
  if (room.safetyTimer) clearTimeout(room.safetyTimer);
  if (room.broadcastTimer) clearTimeout(room.broadcastTimer);
  room.players.forEach(player => { if (userRooms.get(player.id) === room) userRooms.delete(player.id); });
  rooms.delete(room.code);
}

/** Hand the host role to the first still-connected player (if the current host is gone). */
function ensureHost(room: Room) {
  const host = room.players.find(player => player.id === room.hostId);
  if (host && host.connected) return;
  const next = room.players.find(player => player.connected);
  if (!next) return;
  room.hostId = next.id;
  room.players.forEach(player => { player.isHost = player.id === room.hostId; });
}

function removePlayerByHost(room: Room, targetUserId: number, banned: boolean) {
  const targetSocket = room.sockets.get(targetUserId);
  if (banned) room.bannedUserIds.add(targetUserId);
  room.players = room.players.filter(player => player.id !== targetUserId);
  room.sockets.delete(targetUserId);
  if (userRooms.get(targetUserId) === room) userRooms.delete(targetUserId);
  if (targetSocket) {
    socketUsers.delete(targetSocket);
    send(targetSocket, { type: "removed", banned });
    targetSocket.close(4003, banned ? "Banned from room" : "Kicked from room");
  }
  broadcast(room);
}

function removeOrDisconnect(socket: WebSocket, acknowledge: boolean) {
  const context = socketUsers.get(socket);
  if (!context) {
    if (acknowledge) send(socket, { type: "left" });
    return;
  }
  socketUsers.delete(socket);
  const { room, userId } = context;
  if (room.sockets.get(userId) !== socket) return;
  room.sockets.delete(userId);
  if (userRooms.get(userId) === room) userRooms.delete(userId);
  const player = room.players.find(item => item.id === userId);
  if (room.status === "lobby") {
    room.players = room.players.filter(item => item.id !== userId);
    if (!room.players.length) {
      destroyRoom(room);
    } else {
      ensureHost(room);
      broadcast(room);
    }
  } else if (player) {
    player.connected = false;
    if (!player.finished) player.alive = false;
    if (room.players.every(item => !item.connected)) {
      // Nobody is left to see this race; free the room and its timers.
      destroyRoom(room);
    } else {
      ensureHost(room);
      broadcast(room);
      checkRaceEnd(room);
    }
  }
  if (acknowledge) send(socket, { type: "left" });
}

async function authenticateAndAttach(socket: WebSocket, token: string, requestedRoom?: Room) {
  const userId = resolveSessionToken(token);
  if (userId === null) {
    send(socket, { type: "error", message: "Authentication required." });
    return null;
  }
  const user = await storage.getUserById(userId);
  if (!user) {
    send(socket, { type: "error", message: "Account not found." });
    return null;
  }
  const occupied = userRooms.get(userId);
  if (occupied && occupied !== requestedRoom) {
    send(socket, { type: "error", message: "You are already in another race room." });
    return null;
  }
  const previous = occupied?.sockets.get(userId);
  if (previous && previous !== socket) {
    occupied!.sockets.set(userId, socket);
    socketUsers.set(socket, { userId, room: occupied! });
    previous.close(4001, "Replaced by another connection");
  }
  return { userId, user };
}

export function setupRaceServer(httpServer: Server): void {
  // noServer mode: only claim upgrades for /ws/race so Vite's HMR socket (and anything
  // else sharing this HTTP server) keeps working. A path-bound WebSocketServer would
  // answer every non-matching upgrade with a 400.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  httpServer.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      pathname = "";
    }
    if (pathname !== "/ws/race") return;
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
  });
  wss.on("connection", socket => {
    socket.on("message", async raw => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: "error", message: "Invalid JSON message." });
        return;
      }
      const result = messageSchema.safeParse(parsed);
      if (!result.success) {
        send(socket, { type: "error", message: "Invalid race message." });
        return;
      }
      const message = result.data as RaceClientMessage;
      try {
        if (message.type === "create" || message.type === "join") {
          if (socketUsers.has(socket)) return send(socket, { type: "error", message: "Leave your current room first." });
          if (authenticating.has(socket)) return send(socket, { type: "error", message: "Still connecting, please wait." });
        }
        if (message.type === "create") {
          authenticating.add(socket);
          let auth: Awaited<ReturnType<typeof authenticateAndAttach>>;
          try {
            auth = await authenticateAndAttach(socket, message.token);
          } finally {
            authenticating.delete(socket);
          }
          if (!auth) return;
          // Re-check after the await: the socket may have been attached or closed meanwhile.
          if (socketUsers.has(socket) || socket.readyState !== WebSocket.OPEN) return;
          const player: RacePlayer = {
            id: auth.userId, username: auth.user.username, skin: auth.user.equippedSkin,
            isHost: true, ready: true, distance: 0, cores: 0, lives: 3, alive: true,
            finished: false, finishOrder: null, place: null, connected: true,
          };
          const room: Room = {
            code: makeCode(), status: "lobby", hostId: auth.userId,
            targetDistance: RACE_TARGET_DISTANCE, startAt: null, players: [player],
            standings: [], sockets: new Map([[auth.userId, socket]]), lastProgressBroadcast: 0,
            bannedUserIds: new Set(),
            messages: [],
          };
          rooms.set(room.code, room);
          userRooms.set(auth.userId, room);
          socketUsers.set(socket, { userId: auth.userId, room });
          send(socket, { type: "welcome", userId: auth.userId });
          broadcast(room);
          return;
        }
        if (message.type === "join") {
          const room = rooms.get(message.code);
          if (!room) return send(socket, { type: "error", message: "Room not found." });
          authenticating.add(socket);
          let auth: Awaited<ReturnType<typeof authenticateAndAttach>>;
          try {
            auth = await authenticateAndAttach(socket, message.token, room);
          } finally {
            authenticating.delete(socket);
          }
          if (!auth) return;
          if (socket.readyState !== WebSocket.OPEN) return;
          if (rooms.get(message.code) !== room) return send(socket, { type: "error", message: "Room no longer exists." });
          if (room.bannedUserIds.has(auth.userId)) return send(socket, { type: "error", message: "You are banned from this room." });
          if (socketUsers.has(socket) && socketUsers.get(socket)!.room !== room) return send(socket, { type: "error", message: "Leave your current room first." });
          const existing = room.players.find(player => player.id === auth.userId);
          if (!existing && room.status !== "lobby") return send(socket, { type: "error", message: "Race already started." });
          if (!existing && room.players.length >= 6) return send(socket, { type: "error", message: "Room is full." });
          if (existing) {
            existing.connected = true;
            room.sockets.set(auth.userId, socket);
          } else {
            room.players.push({
              id: auth.userId, username: auth.user.username, skin: auth.user.equippedSkin,
              isHost: false, ready: false, distance: 0, cores: 0, lives: 3, alive: true,
              finished: false, finishOrder: null, place: null, connected: true,
            });
            room.sockets.set(auth.userId, socket);
          }
          userRooms.set(auth.userId, room);
          socketUsers.set(socket, { userId: auth.userId, room });
          send(socket, { type: "welcome", userId: auth.userId });
          broadcast(room);
          return;
        }
        const context = socketUsers.get(socket);
        if (!context || context.room.sockets.get(context.userId) !== socket) {
          return send(socket, { type: "error", message: "Join a room first." });
        }
        const { room, userId } = context;
        const player = room.players.find(item => item.id === userId)!;
        if (message.type === "leave") return removeOrDisconnect(socket, true);
        if (message.type === "kick" || message.type === "ban") {
          if (room.status !== "lobby") return send(socket, { type: "error", message: "Players can only be removed from the lobby." });
          if (room.hostId !== userId) return send(socket, { type: "error", message: "Only the room owner can remove players." });
          if (message.targetUserId === userId) return send(socket, { type: "error", message: "The room owner cannot remove themselves." });
          if (!room.players.some(item => item.id === message.targetUserId)) {
            return send(socket, { type: "error", message: "Player is no longer in this room." });
          }
          removePlayerByHost(room, message.targetUserId, message.type === "ban");
          return;
        }
        if (message.type === "ready") {
          if (room.status !== "lobby" || player.isHost) return send(socket, { type: "error", message: "Ready status cannot be changed now." });
          player.ready = message.ready;
          broadcast(room);
        } else if (message.type === "start") {
          if (room.status !== "lobby" || room.hostId !== userId) return send(socket, { type: "error", message: "Only the host can start from the lobby." });
          if (room.players.length < 2 || room.players.some(item => !item.isHost && !item.ready)) {
            return send(socket, { type: "error", message: "At least two players must be ready." });
          }
          room.status = "countdown";
          room.startAt = Date.now() + 4000;
          broadcast(room);
          room.countdownTimer = setTimeout(() => beginRace(room), 4000);
        } else if (message.type === "progress") {
          if (room.status !== "racing" || !player.alive || player.finished) return;
          updateStats(player, message.distance, message.cores);
          if (room.targetDistance !== null && player.distance >= room.targetDistance) {
            player.finished = true;
            player.finishOrder = room.players.filter(item => item.finished).length;
          }
          broadcastProgress(room);
          checkRaceEnd(room);
        } else if (message.type === "hit") {
          if (room.status !== "racing" || player.finished || !player.alive) return;
          updateStats(player, message.distance, message.cores);
          player.lives = Math.max(0, player.lives - 1);
          if (player.lives === 0) player.alive = false;
          broadcast(room);
          checkRaceEnd(room);
        } else if (message.type === "dead") {
          if (room.status !== "racing" || player.finished || !player.alive) return;
          updateStats(player, message.distance, message.cores);
          if (room.targetDistance !== null && player.distance >= room.targetDistance) {
            player.finished = true;
            player.finishOrder = room.players.filter(item => item.finished).length;
          } else {
            player.lives = 0;
            player.alive = false;
          }
          broadcast(room);
          checkRaceEnd(room);
        } else if (message.type === "rematch") {
          if (room.status !== "finished" || room.hostId !== userId) return send(socket, { type: "error", message: "Only the host can start a rematch." });
          room.players = room.players.filter(item => item.connected);
          ensureHost(room);
          room.players.forEach(item => {
            item.ready = item.isHost; item.distance = 0; item.cores = 0; item.lives = 3; item.alive = true;
            item.finished = false; item.finishOrder = null; item.place = null;
          });
          room.status = "lobby";
          room.startAt = null;
          room.standings = [];
          broadcast(room);
        } else if (message.type === "chat") {
          const text = message.text.trim();
          if (!text) return;
          const chatMsg = {
            id: Math.random().toString(36).slice(2) + Date.now().toString(36),
            userId,
            username: player.username,
            text,
            timestamp: Date.now(),
          };
          if (!room.messages) room.messages = [];
          room.messages.push(chatMsg);
          if (room.messages.length > 50) room.messages.shift();
          const serverMsg: RaceServerMessage = { type: "chat", message: chatMsg };
          room.sockets.forEach(s => send(s, serverMsg));
        } else if (message.type === "emote") {
          const emoteId = message.emoteId.trim();
          if (!emoteId) return;
          const emoteMsg = {
            id: Math.random().toString(36).slice(2) + Date.now().toString(36),
            userId,
            username: player.username,
            emoteId,
            timestamp: Date.now(),
          };
          if (!room.messages) room.messages = [];
          room.messages.push(emoteMsg);
          if (room.messages.length > 50) room.messages.shift();
          const serverMsg: RaceServerMessage = { type: "chat", message: emoteMsg };
          room.sockets.forEach(s => send(s, serverMsg));
        }
      } catch (error) {
        console.error("Race WebSocket message failed:", error);
        send(socket, { type: "error", message: "Unable to process race message." });
      }
    });
    socket.on("close", () => removeOrDisconnect(socket, false));
    socket.on("error", () => removeOrDisconnect(socket, false));
  });
}