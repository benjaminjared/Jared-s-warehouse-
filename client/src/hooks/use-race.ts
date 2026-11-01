import { useCallback, useEffect, useRef, useState } from "react";
import type { RaceChatMessage, RaceClientMessage, RacePlayer, RaceRoomState, RaceServerMessage } from "@shared/race";

export function useRace(token: string | undefined): {
  room: RaceRoomState | null;
  me: RacePlayer | null;
  error: string | null;
  connected: boolean;
  messages: RaceChatMessage[];
  latestEmotes: Record<number, { emoteId: string; timestamp: number }>;
  createRoom(): void;
  joinRoom(code: string): void;
  setReady(ready: boolean): void;
  startRace(): void;
  sendProgress(distance: number, cores: number): void;
  sendHit(distance: number, cores: number): void;
  sendDead(distance: number, cores: number): void;
  kickPlayer(targetUserId: number): void;
  banPlayer(targetUserId: number): void;
  leaveRoom(): void;
  rematch(): void;
  sendChat(text: string): void;
  sendEmote(emoteId: string): void;
} {
  const [room, setRoom] = useState<RaceRoomState | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<RaceChatMessage[]>([]);
  const [latestEmotes, setLatestEmotes] = useState<Record<number, { emoteId: string; timestamp: number }>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<RaceClientMessage | null>(null);
  const lastProgressRef = useRef(0);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedProgressRef = useRef<{ distance: number; cores: number } | null>(null);

  const transmit = useCallback((message: RaceClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  const connect = useCallback((initial: RaceClientMessage) => {
    if (!token) {
      setError("Login required.");
      return;
    }
    const existing = socketRef.current;
    if (existing?.readyState === WebSocket.OPEN) {
      existing.send(JSON.stringify(initial));
      return;
    }
    if (existing?.readyState === WebSocket.CONNECTING) {
      pendingRef.current = initial;
      return;
    }
    setError(null);
    pendingRef.current = initial;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/race`);
    socketRef.current = socket;
    socket.onopen = () => {
      setConnected(true);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) socket.send(JSON.stringify(pending));
    };
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data) as RaceServerMessage;
        if (message.type === "welcome") {
          setMeId(message.userId);
          setError(null);
        } else if (message.type === "room") {
          setRoom(message.room);
          if (message.room.messages) {
            setMessages(message.room.messages);
          }
          setError(null);
        } else if (message.type === "chat") {
          setMessages(prev => [...prev.slice(-49), message.message]);
          if (message.message.emoteId) {
            setLatestEmotes(prev => ({
              ...prev,
              [message.message.userId]: { emoteId: message.message.emoteId!, timestamp: Date.now() },
            }));
          }
        } else if (message.type === "removed") {
          setRoom(null);
          setMeId(null);
          setMessages([]);
          setLatestEmotes({});
          setError(message.banned ? "The room owner banned you from this room." : "The room owner kicked you from the room.");
        } else if (message.type === "error") {
          setError(message.message);
        } else if (message.type === "left") {
          setRoom(null);
          setMeId(null);
          setMessages([]);
          setLatestEmotes({});
        }
      } catch {
        setError("Invalid response from race server.");
      }
    };
    socket.onerror = () => {
      if (socketRef.current === socket) setError("Race connection failed.");
    };
    socket.onclose = event => {
      // Ignore delayed events from a socket that has already been replaced or explicitly left.
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      setConnected(false);
      // A dropped connection means we are no longer in the room; surface that to the UI
      // instead of leaving stale room state behind.
      setRoom(current => {
        if (current && event.code !== 1000) setError(event.code === 4001 ? "You opened the race from another tab." : "Lost connection to the race server.");
        return null;
      });
      setMeId(null);
    };
  }, [token]);

  const createRoom = useCallback(() => {
    if (token) connect({ type: "create", token });
    else setError("Login required.");
  }, [connect, token]);
  const joinRoom = useCallback((code: string) => {
    if (token) connect({ type: "join", token, code: code.trim().toUpperCase() });
    else setError("Login required.");
  }, [connect, token]);
  const setReady = useCallback((ready: boolean) => transmit({ type: "ready", ready }), [transmit]);
  const startRace = useCallback(() => transmit({ type: "start" }), [transmit]);
  const sendProgress = useCallback((distance: number, cores: number) => {
    queuedProgressRef.current = { distance, cores };
    const flush = () => {
      const progress = queuedProgressRef.current;
      if (!progress) return;
      queuedProgressRef.current = null;
      lastProgressRef.current = Date.now();
      transmit({ type: "progress", ...progress });
      progressTimerRef.current = null;
    };
    const wait = 200 - (Date.now() - lastProgressRef.current);
    if (wait <= 0 && !progressTimerRef.current) flush();
    else if (!progressTimerRef.current) progressTimerRef.current = setTimeout(flush, Math.max(0, wait));
  }, [transmit]);
  const sendDead = useCallback((distance: number, cores: number) => {
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = null;
    queuedProgressRef.current = null;
    transmit({ type: "dead", distance, cores });
  }, [transmit]);
  const sendHit = useCallback((distance: number, cores: number) => {
    transmit({ type: "hit", distance, cores });
  }, [transmit]);
  const kickPlayer = useCallback((targetUserId: number) => transmit({ type: "kick", targetUserId }), [transmit]);
  const banPlayer = useCallback((targetUserId: number) => transmit({ type: "ban", targetUserId }), [transmit]);
  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "leave" }));
    setRoom(null);
    setMeId(null);
    setConnected(false);
    setMessages([]);
    setLatestEmotes({});
    socketRef.current = null;
    socket?.close();
  }, []);
  const rematch = useCallback(() => transmit({ type: "rematch" }), [transmit]);

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed) transmit({ type: "chat", text: trimmed });
  }, [transmit]);

  const sendEmote = useCallback((emoteId: string) => {
    transmit({ type: "emote", emoteId });
  }, [transmit]);

  useEffect(() => () => {
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    socketRef.current?.close();
  }, []);

  const me = room?.players.find(player => player.id === meId) ?? null;
  return {
    room,
    me,
    error,
    connected,
    messages,
    latestEmotes,
    createRoom,
    joinRoom,
    setReady,
    startRace,
    sendProgress,
    sendHit,
    sendDead,
    kickPlayer,
    banPlayer,
    leaveRoom,
    rematch,
    sendChat,
    sendEmote,
  };
}