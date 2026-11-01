import { Cpu, Flag, Heart, Skull } from "lucide-react";
import type { RaceRoomState } from "@shared/race";

export function RaceHud({ room, meId }: { room: RaceRoomState; meId: number }) {
  const standings = [...room.players].sort((a, b) =>
    Number(b.finished) - Number(a.finished) || b.distance - a.distance || b.cores - a.cores
  );

  return (
    <div className="pointer-events-none w-full border-2 border-secondary/40 bg-black/85 p-2 neon-box-cyan">
      <div className="font-arcade text-[8px] text-secondary tracking-widest mb-2 text-center">
        MULTIPLAYER SCORES // INFINITE SURVIVAL // 3 LIVES
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {standings.map((player, index) => (
          <div key={player.id} className={`border border-secondary/20 p-1.5 ${player.id === meId ? "text-primary bg-primary/10" : "text-foreground"}`}>
            <div className="flex items-center gap-1 font-tech text-[10px] leading-none">
              <span className="text-secondary/60">#{index + 1}</span>
              <span className="truncate flex-1">{player.username}</span>
              {!player.alive && !player.finished && <Skull className="w-3 h-3 text-destructive" />}
              {player.finished && <Flag className="w-3 h-3 text-accent" />}
            </div>
            <div className="flex items-center justify-between mt-1 font-tech text-[9px]">
              <span className="tabular-nums">{Math.floor(player.distance)}m</span>
              <span className="flex items-center gap-1 text-cyan-300"><Cpu className="w-2.5 h-2.5" />{Math.floor(player.cores)}</span>
              <span className="flex items-center gap-0.5 text-red-400">
                {Array.from({ length: 3 }, (_, life) => (
                  <Heart key={life} className={`w-2.5 h-2.5 ${life < player.lives ? "fill-current" : "opacity-20"}`} />
                ))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}