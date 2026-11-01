import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, Clock, Cpu, GripVertical, HardDrive, MemoryStick, MonitorUp, Power, Star } from "lucide-react";

type PartId = "motherboard" | "cpu" | "ram_a" | "ram_b" | "gpu" | "psu";

type Part = {
  id: PartId;
  label: string;
  slot: string;
  color: string;
  icon: typeof Cpu;
};

const PARTS: Part[] = [
  { id: "motherboard", label: "MOTHERBOARD", slot: "case", color: "#54e0c0", icon: HardDrive },
  { id: "cpu", label: "CPU", slot: "cpu", color: "#ff79c6", icon: Cpu },
  { id: "ram_a", label: "RAM STICK A", slot: "ram_a", color: "#ffd34d", icon: MemoryStick },
  { id: "ram_b", label: "RAM STICK B", slot: "ram_b", color: "#ff9f43", icon: MemoryStick },
  { id: "gpu", label: "GPU", slot: "gpu", color: "#7bb7ff", icon: MonitorUp },
  { id: "psu", label: "POWER SUPPLY", slot: "psu", color: "#c05cff", icon: Power },
];

const SLOT_LABELS: { slot: string; label: string; requires?: PartId; className: string }[] = [
  { slot: "case", label: "MOTHERBOARD TRAY", className: "col-span-2 h-24" },
  { slot: "cpu", label: "CPU SOCKET", requires: "motherboard", className: "h-20" },
  { slot: "ram_a", label: "RAM SLOT A", requires: "motherboard", className: "h-20" },
  { slot: "ram_b", label: "RAM SLOT B", requires: "motherboard", className: "h-20" },
  { slot: "gpu", label: "PCIe SLOT", requires: "motherboard", className: "col-span-2 h-20" },
  { slot: "psu", label: "PSU BAY", className: "col-span-2 h-20" },
];

interface PcBuildMinigameProps {
  onComplete: (success: boolean, elapsedSeconds: number) => void;
}

export function PcBuildMinigame({ onComplete }: PcBuildMinigameProps) {
  const [remaining, setRemaining] = useState(180);
  const [placed, setPlaced] = useState<PartId[]>([]);
  const [selected, setSelected] = useState<PartId | null>(null);
  const [message, setMessage] = useState("YOU HAVE BEEN DRAFTED. BUILD THE PC.");
  const [finished, setFinished] = useState(false);
  const completedRef = useRef(false);
  const bin = useMemo(() => [...PARTS].sort((a, b) => a.id.localeCompare(b.id)), []);

  const finish = useCallback((success: boolean, elapsedSeconds: number) => {
    if (completedRef.current) return;
    completedRef.current = true;
    setFinished(true);
    if (success) {
      window.setTimeout(() => onComplete(true, elapsedSeconds), 650);
    } else {
      onComplete(false, elapsedSeconds);
    }
  }, [onComplete]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(value => {
        if (value <= 1) {
          window.clearInterval(timer);
          finish(false, 180);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finish]);

  const placePart = (partId: PartId, slot: string) => {
    if (finished || placed.includes(partId)) return;
    const part = PARTS.find(item => item.id === partId);
    const target = SLOT_LABELS.find(item => item.slot === slot);
    if (!part || !target) return;
    if (part.slot !== slot) {
      setMessage(`${part.label} DOES NOT FIT IN ${target.label}.`);
      return;
    }
    if (target.requires && !placed.includes(target.requires)) {
      setMessage("INSTALL THE MOTHERBOARD FIRST.");
      return;
    }
    const next = [...placed, partId];
    setPlaced(next);
    setSelected(null);
    setMessage(`${part.label} INSTALLED.`);
    if (next.length === PARTS.length) {
      const elapsed = 180 - remaining;
      setMessage(elapsed < 55 ? "STAR EMPLOYEE BUILD!" : "BUILD COMPLETE!");
      finish(true, elapsed);
    }
  };

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");
  const elapsed = 180 - remaining;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[700] bg-black/95 flex items-start justify-start md:items-center md:justify-center p-3 overflow-y-auto overscroll-contain"
      style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
      data-testid="pc-build-minigame"
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-4xl my-0 md:my-auto bg-background border-2 border-destructive/70 pixel-frame"
        style={{ boxShadow: "0 0 35px rgba(255,42,80,.3)" }}
      >
        <div className="border-b-2 border-destructive/40 bg-destructive/10 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-destructive animate-pulse" />
            <div>
              <h2 className="font-arcade text-sm text-destructive tracking-widest">MANDATORY PC BUILD</h2>
              <p className="font-tech text-[10px] text-muted-foreground mt-1">NO OPT-OUT // COMPLETE THE WAREHOUSE WORK ORDER</p>
            </div>
          </div>
          <div className={`font-arcade text-xl flex items-center gap-2 ${remaining <= 30 ? "text-destructive animate-pulse" : "text-accent"}`}>
            <Clock className="w-5 h-5" /> {mm}:{ss}
          </div>
        </div>

        <div className="grid md:grid-cols-[280px_1fr] gap-4 p-4">
          <section className="border-2 border-secondary/30 bg-secondary/5 p-3">
            <div className="font-arcade text-[10px] text-secondary tracking-widest mb-3">PARTS BIN</div>
            <p className="font-tech text-[10px] text-muted-foreground mb-3">Drag a part into its slot, or tap a part then tap its slot.</p>
            <div className="space-y-2">
              {bin.map(part => {
                const Icon = part.icon;
                const installed = placed.includes(part.id);
                return (
                  <button
                    key={part.id}
                    draggable={!installed}
                    onDragStart={event => event.dataTransfer.setData("text/pc-part", part.id)}
                    onClick={() => !installed && setSelected(part.id)}
                    disabled={installed}
                    className={`w-full border-2 px-3 py-3 flex items-center gap-2 text-left transition-colors ${
                      installed ? "opacity-35 border-green-500/30" : selected === part.id ? "bg-white/10" : "bg-black/30 hover:bg-white/5"
                    }`}
                    style={{ borderColor: selected === part.id ? part.color : undefined }}
                    data-testid={`pc-part-${part.id}`}
                  >
                    <GripVertical className="w-3 h-3 text-muted-foreground" />
                    <Icon className="w-4 h-4" style={{ color: part.color }} />
                    <span className="font-arcade text-[9px] flex-1" style={{ color: part.color }}>{part.label}</span>
                    {installed && <Check className="w-4 h-4 text-green-400" />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="border-2 border-primary/30 bg-primary/5 p-3">
            <div className="flex justify-between items-center mb-3">
              <span className="font-arcade text-[10px] text-primary tracking-widest">OPEN PC CASE</span>
              <span className="font-tech text-[10px] text-muted-foreground">{placed.length}/{PARTS.length} INSTALLED</span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-4 border-zinc-700 bg-zinc-950 p-3 min-h-[360px]">
              {SLOT_LABELS.map(target => {
                const part = PARTS.find(item => item.slot === target.slot)!;
                const installed = placed.includes(part.id);
                return (
                  <button
                    key={target.slot}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => placePart(event.dataTransfer.getData("text/pc-part") as PartId, target.slot)}
                    onClick={() => selected && placePart(selected, target.slot)}
                    className={`${target.className} relative border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
                      installed ? "bg-green-500/10 border-green-400/70" : selected ? "hover:bg-white/10 border-muted-foreground/50" : "border-muted/40"
                    }`}
                    data-testid={`pc-slot-${target.slot}`}
                  >
                    {installed ? (
                      <>
                        <Check className="w-5 h-5 text-green-400" />
                        <span className="font-arcade text-[8px] text-green-400">{part.label}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-arcade text-[8px] text-muted-foreground">{target.label}</span>
                        <span className="font-tech text-[9px] text-muted-foreground/50">DROP HERE</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="px-5 pb-5 grid sm:grid-cols-[1fr_auto] gap-3 items-center">
          <div className="terminal-box py-3">
            <div className="font-tech text-xs text-secondary">{message}</div>
            <div className="font-tech text-[10px] text-muted-foreground mt-1">
              WIN: 2× CUDA CORES FOR 1 MINUTE // FAIL: 50% SPEED FOR 1 MINUTE
            </div>
          </div>
          <div className={`border px-3 py-3 flex items-center gap-2 ${elapsed < 55 ? "border-accent/60 text-accent" : "border-muted/30 text-muted-foreground"}`}>
            <Star className="w-4 h-4" />
            <div>
              <div className="font-arcade text-[8px]">STAR EMPLOYEE</div>
              <div className="font-tech text-[9px]">finish under 55s</div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}