import { Star, ThumbsUp, ArrowRight, type LucideIcon } from "lucide-react";
import type { MoveClass } from "@/lib/game-review";

// Per-class presentation for the chess.com-style markers: `label` for the
// tooltip, `symbol`/`icon` for the glyph (icon wins when set), `badge` (solid)
// and `tint` (translucent) for the colors. Colors mirror chess.com's palette.
// Shared by the on-board badges, the move list, and the report-card breakdown.
export const MOVE_CLASS_STYLE: Record<
  MoveClass,
  { label: string; symbol: string; icon?: LucideIcon; badge: string; tint: string }
> = {
  brilliant:  { label: "Brilliant",  symbol: "!!",                badge: "#1baca6", tint: "rgba(27,172,166,0.45)" },
  great:      { label: "Great move", symbol: "!",                 badge: "#5c8bb0", tint: "rgba(92,139,176,0.45)" },
  best:       { label: "Best",       symbol: "★", icon: Star,     badge: "#81b64c", tint: "rgba(129,182,76,0.45)" },
  excellent:  { label: "Excellent",  symbol: "!", icon: ThumbsUp, badge: "#81b64c", tint: "rgba(129,182,76,0.40)" },
  good:       { label: "Good",       symbol: "✓",                 badge: "#95b776", tint: "rgba(149,183,118,0.40)" },
  forced:     { label: "Forced",     symbol: "→", icon: ArrowRight, badge: "#9b9b9b", tint: "rgba(155,155,155,0.40)" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!",                badge: "#f7c631", tint: "rgba(247,198,49,0.45)" },
  miss:       { label: "Miss",       symbol: "✗",                 badge: "#e06c5a", tint: "rgba(224,108,90,0.45)" },
  mistake:    { label: "Mistake",    symbol: "?",                 badge: "#ffa459", tint: "rgba(255,164,89,0.45)" },
  blunder:    { label: "Blunder",    symbol: "??",                badge: "#fa412d", tint: "rgba(250,65,45,0.45)" },
};
