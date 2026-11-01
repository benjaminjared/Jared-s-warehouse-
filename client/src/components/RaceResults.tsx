import { motion } from "framer-motion";
import { LogOut, RotateCcw, Trophy } from "lucide-react";
import type { RaceRoomState } from "@shared/race";

interface RaceResultsProps {
  room: RaceRoomState;
  meId: number;
  onBackToLobby: () => void;
  onExit: () => void;
}

const placeLabel = (place: number) => place === 1 ? "1ST" : place === 2 ? "2ND" : place === 3 ? "3RD" : `${place}TH`;
const placeColor = (place: number) => place === 1 ? "text-accent border-accent/60" : place === 2 ? "text-slate-300 border-slate-300/60" : place === 3 ? "text-orange-500 border-orange-500/60" : "text-secondary border-secondary/30";

export function RaceResults({ room, meId, onBackToLobby, onExit }: RaceResultsProps) {
  const standings = room.status === "finished" ? room.standings : [];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[450] bg-black/90 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="w-full max-w-lg border-2 border-accent/50 bg-background neon-box-gold pixel-frame p-5">
        <div className="text-center mb-5">
          <Trophy className="w-8 h-8 text-accent mx-auto mb-3" />
          <h2 className="font-arcade text-lg text-accent tracking-widest">RACE RESULTS</h2>
        </div>
        {room.status !== "finished" ? (
          <motion.div animate={{ opacity: [0.35, 1, 0.35] }} transition={{ repeat: Infinity, duration: 1.4 }}
            className="font-arcade text-[10px] text-secondary text-center py-12 tracking-widest">
            WAITING FOR OTHER RACERS...
          </motion.div>
        ) : (
          <div className="space-y-2">
            {standings.map((player, index) => {
              const place = player.place ?? index + 1;
              return (
                <div key={player.id} className={`grid grid-cols-[52px_1fr_auto] items-center gap-3 border-2 p-3 ${placeColor(place)} ${player.id === meId ? "bg-primary/10" : "bg-white/[0.02]"}`}>
                  <span className="font-arcade text-[10px]">{placeLabel(place)}</span>
                  <span className="font-arcade text-[9px] truncate">{player.username}</span>
                  <span className="font-tech text-[10px] text-right">{Math.floor(player.distance)}m<br /><span className="text-accent">{Math.floor(player.cores)} cores</span></span>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-3 mt-5">
          <button onClick={onBackToLobby} disabled={room.status !== "finished"}
            className="flex-1 flex items-center justify-center gap-2 border-2 border-secondary px-3 py-3 font-arcade text-[9px] text-secondary hover:bg-secondary hover:text-black disabled:opacity-30">
            <RotateCcw className="w-4 h-4" /> BACK TO LOBBY
          </button>
          <button onClick={onExit} className="flex items-center gap-2 border-2 border-destructive/60 px-3 py-3 font-arcade text-[9px] text-destructive">
            <LogOut className="w-4 h-4" /> EXIT
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}