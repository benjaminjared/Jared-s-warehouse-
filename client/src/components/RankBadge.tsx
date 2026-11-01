import type { RankInfo } from "@shared/schema";
import { Crown, Shield } from "lucide-react";

interface RankBadgeProps {
  rank: RankInfo;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Pixel-style rank chip used on the leaderboard, account panel and player pages. */
export function RankBadge({ rank, size = "sm", className = "" }: RankBadgeProps) {
  const isTitle = rank.position !== null;
  const text = size === "lg" ? "text-sm px-4 py-2" : size === "md" ? "text-[10px] px-3 py-1.5" : "text-[8px] px-2 py-1";
  const icon = size === "lg" ? "w-4 h-4" : "w-3 h-3";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-arcade tracking-widest border-2 whitespace-nowrap ${text} ${isTitle ? "animate-pulse" : ""} ${className}`}
      style={{
        color: rank.color,
        borderColor: rank.color,
        backgroundColor: `${rank.color}1a`,
        boxShadow: isTitle ? `0 0 12px ${rank.color}80` : undefined,
      }}
      title={isTitle ? `Leaderboard #${rank.position}` : `Rank: ${rank.label}`}
      data-testid={`rank-badge-${rank.id}`}
    >
      {isTitle ? <Crown className={icon} /> : <Shield className={icon} />}
      {rank.label}
    </span>
  );
}
