import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Check, Copy, Crown, LogOut, Play, UserX, Users, X, MessageSquare, Send, Smile } from "lucide-react";
import { SKINS } from "@shared/schema";
import type { RaceRoomState } from "@shared/race";
import type { useRace } from "@/hooks/use-race";
import { useToast } from "@/hooks/use-toast";

const ARCADE_EMOTES = [
  { id: "wave", icon: "👋", name: "WAVE" },
  { id: "fire", icon: "🔥", name: "FIRE" },
  { id: "volt", icon: "⚡", name: "VOLT" },
  { id: "zoom", icon: "🏎️", name: "ZOOM" },
  { id: "skull", icon: "💀", name: "OOF" },
  { id: "trophy", icon: "🏆", name: "WIN" },
];

interface RaceLobbyProps {
  token: string;
  race: ReturnType<typeof useRace>;
  onClose: () => void;
  onRaceStart: (room: RaceRoomState) => void;
}

export function RaceLobby({ race, onClose, onRaceStart }: RaceLobbyProps) {
  const [code, setCode] = useState("");
  const [now, setNow] = useState(Date.now());
  const [chatInput, setChatInput] = useState("");
  const startedRef = useRef<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const room = race.room;

  // The server's "racing" status is authoritative for starting the run; the countdown
  // numbers are display-only so client clock skew can never strand a player.
  useEffect(() => {
    if (!room) return;
    if (room.status === "racing") {
      const startKey = `${room.code}:racing`;
      if (startedRef.current !== startKey) {
        startedRef.current = startKey;
        onRaceStart(room);
      }
      return;
    }
    if (room.status === "lobby" || room.status === "finished") {
      startedRef.current = null;
      return;
    }
    if (room.status !== "countdown" || room.startAt === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [room, onRaceStart]);

  // Keep chat scrolled to the bottom on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [race.messages]);

  const close = () => {
    if (room) race.leaveRoom();
    onClose();
  };

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    race.sendChat(trimmed);
    setChatInput("");
  };

  const handleSendEmote = (icon: string) => {
    race.sendEmote(icon);
  };

  const countdown = room?.startAt ? Math.max(0, room.startAt - now) : 0;
  const countdownText = countdown <= 0 ? "GO!" : String(Math.min(3, Math.ceil(countdown / 1000)));
  const canStart = !!room && room.players.length >= 2 && room.players.every(player => player.isHost || player.ready);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[450] bg-black/90 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="relative w-full max-w-2xl bg-background border-2 border-secondary/50 neon-box-cyan pixel-frame overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-secondary/30 bg-secondary/10">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-secondary" />
            <div>
              <h2 className="font-arcade text-sm text-secondary tracking-widest">MULTIPLAYER RACE</h2>
              <p className="font-tech text-[10px] text-secondary/60 tracking-widest">INFINITE WAREHOUSE SURVIVAL</p>
            </div>
          </div>
          <button onClick={close} className="text-secondary/60 hover:text-secondary"><X className="w-5 h-5" /></button>
        </header>

        <div className="p-4 sm:p-5">
          {!room ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="border-2 border-primary/40 bg-primary/5 p-5 text-center neon-box-pink">
                <h3 className="font-arcade text-xs text-primary tracking-widest mb-4">CREATE ROOM</h3>
                <button onClick={race.createRoom} className="w-full border-2 border-primary px-3 py-3 font-arcade text-[10px] text-primary hover:bg-primary hover:text-black transition-colors">
                  OPEN LOBBY
                </button>
              </div>
              <div className="border-2 border-secondary/40 bg-secondary/5 p-5 text-center">
                <h3 className="font-arcade text-xs text-secondary tracking-widest mb-4">JOIN ROOM</h3>
                <input value={code} maxLength={4} aria-label="Room code"
                  onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ""))}
                  className="w-full mb-3 bg-black/50 border-2 border-secondary/50 px-3 py-2 text-center font-arcade text-lg text-secondary tracking-[0.35em] outline-none focus:border-secondary" />
                <button disabled={code.length !== 4} onClick={() => race.joinRoom(code)}
                  className="w-full border-2 border-secondary px-3 py-3 font-arcade text-[10px] text-secondary hover:bg-secondary hover:text-black disabled:opacity-30 transition-colors">
                  CONNECT
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Room Code Header */}
              <div className="flex items-center justify-between bg-black/40 border border-secondary/30 px-4 py-2">
                <div>
                  <span className="font-tech text-[10px] text-muted-foreground tracking-widest uppercase">ROOM CODE: </span>
                  <span className="font-arcade text-xl text-accent tracking-[0.2em]">{room.code}</span>
                </div>
                <button className="text-accent/70 hover:text-accent flex items-center gap-1 font-tech text-xs" onClick={async () => {
                  await navigator.clipboard.writeText(room.code);
                  toast({ title: "Room code copied!", description: room.code });
                }}>
                  <Copy className="w-3.5 h-3.5" />
                  <span>COPY</span>
                </button>
              </div>

              {/* Player Roster Cards with Emote Floating Badges */}
              <div className="grid sm:grid-cols-2 gap-2">
                {room.players.map(player => {
                  const skin = SKINS.find(item => item.id === player.skin) ?? SKINS[0];
                  const activeEmote = race.latestEmotes[player.id];
                  const showBubble = activeEmote && (Date.now() - activeEmote.timestamp < 3500);

                  return (
                    <div
                      key={player.id}
                      className={`relative flex items-center gap-2.5 border px-3 py-2.5 ${
                        player.id === race.me?.id ? "border-primary/60 bg-primary/10" : "border-secondary/25 bg-secondary/5"
                      }`}
                    >
                      {/* Floating Speech Bubble for Emotes */}
                      <AnimatePresence>
                        {showBubble && (
                          <motion.div
                            initial={{ scale: 0.5, y: 10, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            className="absolute -top-3.5 right-3 z-20 bg-amber-400 text-black px-2 py-0.5 rounded shadow-[0_0_10px_rgba(255,200,0,0.5)] border border-amber-200 font-arcade text-xs flex items-center gap-1"
                          >
                            <span>{activeEmote.emoteId}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <span className="w-5 h-5 border-2 shrink-0 relative overflow-hidden" style={{ background: skin.color, borderColor: skin.accent }}>
                        {skin.animated && (
                          <div className={`absolute inset-0 ${skin.id === 'quantum_holo' ? 'quantum-holo-shirt' : 'redacted-shirt'}`} />
                        )}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="font-arcade text-[10px] truncate text-foreground flex items-center gap-1">
                          {player.username}
                          {player.id === race.me?.id && <span className="text-[8px] text-primary">(YOU)</span>}
                        </div>
                        <div className="font-tech text-[9px] text-muted-foreground/70 truncate">
                          {skin.label}
                        </div>
                      </div>

                      {!player.connected ? (
                        <span className="font-tech text-[9px] text-destructive">OFFLINE</span>
                      ) : player.isHost ? (
                        <span className="flex items-center gap-1 font-arcade text-[8px] text-accent">
                          <Crown className="w-3.5 h-3.5 text-accent" /> HOST
                        </span>
                      ) : player.ready ? (
                        <span className="flex items-center gap-1 font-arcade text-[8px] text-emerald-400">
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> READY
                        </span>
                      ) : (
                        <span className="font-tech text-[9px] text-muted-foreground">WAITING</span>
                      )}

                      {race.me?.isHost && !player.isHost && room.status === "lobby" && (
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            type="button"
                            title={`Kick ${player.username}`}
                            aria-label={`Kick ${player.username}`}
                            onClick={() => race.kickPlayer(player.id)}
                            className="p-1 border border-orange-500/50 text-orange-400 hover:bg-orange-500/15"
                          >
                            <UserX className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            title={`Ban ${player.username} from this room`}
                            aria-label={`Ban ${player.username} from this room`}
                            onClick={() => race.banPlayer(player.id)}
                            className="p-1 border border-destructive/50 text-destructive hover:bg-destructive/15"
                          >
                            <Ban className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quick Arcade Emote Bar */}
              <div className="border border-secondary/30 bg-black/40 px-3 py-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-arcade text-[9px] text-secondary tracking-widest flex items-center gap-1">
                    <Smile className="w-3 h-3" /> ARCADE EMOTES
                  </span>
                  <span className="font-tech text-[9px] text-muted-foreground/60">Tap to react live</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ARCADE_EMOTES.map(em => (
                    <button
                      key={em.id}
                      onClick={() => handleSendEmote(em.icon)}
                      className="flex items-center gap-1 px-2.5 py-1 border border-secondary/40 bg-secondary/10 hover:bg-secondary/25 hover:border-secondary transition-colors font-arcade text-[9px] text-secondary"
                    >
                      <span className="text-sm">{em.icon}</span>
                      <span>{em.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Lobby Chat Log & Input */}
              <div className="border border-secondary/30 bg-black/60 p-2.5 space-y-2">
                <div className="flex items-center gap-1.5 pb-1 border-b border-secondary/20">
                  <MessageSquare className="w-3.5 h-3.5 text-secondary" />
                  <span className="font-arcade text-[9px] text-secondary tracking-widest">LOBBY CHAT</span>
                </div>

                <div
                  ref={chatScrollRef}
                  className="h-24 overflow-y-auto space-y-1 pr-1 font-tech text-xs"
                >
                  {race.messages.length === 0 ? (
                    <div className="text-muted-foreground/50 text-[10px] italic py-2 text-center">
                      No chat messages yet. Say hello or tap an emote!
                    </div>
                  ) : (
                    race.messages.map((msg) => (
                      <div key={msg.id} className="leading-tight flex items-baseline gap-1.5">
                        <span className="font-arcade text-[9px] text-accent shrink-0">{msg.username}:</span>
                        {msg.emoteId ? (
                          <span className="bg-yellow-400/20 text-yellow-300 px-1 py-0.2 rounded text-[11px] border border-yellow-400/30">
                            {msg.emoteId}
                          </span>
                        ) : (
                          <span className="text-foreground/90 break-words">{msg.text}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Input row */}
                <form onSubmit={handleSendChat} className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    maxLength={100}
                    placeholder="Type lobby message..."
                    className="flex-1 bg-black/50 border border-secondary/40 px-2.5 py-1.5 font-tech text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-secondary"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="px-3 py-1.5 border border-secondary bg-secondary/15 hover:bg-secondary/30 disabled:opacity-30 transition-colors font-arcade text-[9px] text-secondary flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" /> SEND
                  </button>
                </form>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                {race.me && !race.me.isHost && (
                  <button onClick={() => race.setReady(!race.me!.ready)}
                    className="flex-1 border-2 border-secondary px-3 py-2.5 font-arcade text-[10px] text-secondary hover:bg-secondary hover:text-black transition-colors">
                    {race.me.ready ? "CANCEL READY" : "READY"}
                  </button>
                )}
                {race.me?.isHost && (
                  <button disabled={!canStart} onClick={race.startRace}
                    className="flex-1 flex justify-center items-center gap-2 border-2 border-accent px-3 py-2.5 font-arcade text-[10px] text-accent hover:bg-accent hover:text-black disabled:opacity-30 transition-colors">
                    <Play className="w-4 h-4" /> START RACE
                  </button>
                )}
                <button onClick={close} className="flex items-center gap-2 border-2 border-destructive/60 px-3 py-2.5 font-arcade text-[10px] text-destructive hover:bg-destructive/10 transition-colors">
                  <LogOut className="w-4 h-4" /> LEAVE
                </button>
              </div>
            </div>
          )}
          {race.error && <p className="mt-3 font-tech text-xs text-destructive text-center">{race.error}</p>}
        </div>

        <AnimatePresence>
          {room?.status === "countdown" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-50">
              <div className="font-tech text-xs text-secondary tracking-widest mb-6">RACE BEGINS IN</div>
              <motion.div key={countdownText} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="font-arcade text-6xl text-accent">{countdownText}</motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}