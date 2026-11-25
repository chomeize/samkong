import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import { parseCard } from "@sam-kong/engine";

const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
const SUIT_NAME = { S: "โพดำ", H: "โพแดง", D: "ข้าวหลามตัด", C: "ดอกจิก" } as const;
const RANK_LABEL: Record<number, string> = { 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A" };

export function cardLabel(id: string) {
  const c = parseCard(id);
  return `${RANK_LABEL[c.rank] ?? c.rank}${SUIT_SYMBOL[c.suit]}`;
}

interface Props extends HTMLAttributes<HTMLDivElement> {
  id: string;
  /** Width in px or any CSS length; height follows a 5:7 playing-card ratio. */
  width?: number | string;
  selected?: boolean;
  dimmed?: boolean;
  faceDown?: boolean;
  /** Visual state while being dragged (the original stays as a ghost). */
  ghost?: boolean;
}

/**
 * A playing card sized for phones: big corner rank and suit so it reads at 44px wide.
 * Suits are colour-coded red/black and also named for screen readers.
 */
export const PlayingCard = forwardRef<HTMLDivElement, Props>(function PlayingCard(
  { id, width = "var(--card-w, 56px)", selected, dimmed, faceDown, ghost, className = "", style, ...rest },
  ref,
) {
  const w = typeof width === "number" ? `${width}px` : width;
  const box: CSSProperties = { width: w, height: `calc(${w} * 1.4)`, fontSize: `calc(${w} * 0.36)`, ...style };

  if (faceDown) {
    return (
      <div
        ref={ref}
        style={box}
        aria-label="ไพ่คว่ำ"
        className={`relative shrink-0 rounded-card border border-white/20 shadow-card ${className}`}
        {...rest}
      >
        <div className="absolute inset-[3px] rounded-[0.35rem] border border-gold/40 bg-[repeating-linear-gradient(45deg,#0d5c44_0_4px,#0a4b37_4px_8px)]" />
      </div>
    );
  }

  const c = parseCard(id);
  const red = c.suit === "H" || c.suit === "D";
  const rank = RANK_LABEL[c.rank] ?? String(c.rank);
  return (
    <div
      ref={ref}
      style={box}
      role="img"
      aria-label={`${rank} ${SUIT_NAME[c.suit]}`}
      className={[
        "relative shrink-0 select-none rounded-card bg-paper font-display leading-none shadow-card transition-[transform,box-shadow,opacity] duration-150",
        red ? "text-suitred" : "text-suitblack",
        selected ? "-translate-y-1.5 shadow-glow" : "",
        dimmed ? "opacity-40" : "",
        ghost ? "opacity-30" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      <span className="absolute left-[8%] top-[6%] flex flex-col items-center font-bold">
        <span className={rank === "10" ? "tracking-[-0.08em]" : ""}>{rank}</span>
        <span className="mt-[2px] text-[0.85em]">{SUIT_SYMBOL[c.suit]}</span>
      </span>
      <span className="absolute bottom-[6%] right-[8%] text-[1.35em] opacity-90" aria-hidden>
        {SUIT_SYMBOL[c.suit]}
      </span>
    </div>
  );
});

/** Empty placeholder where a card can go. */
export function CardSlot({ width = "var(--card-w, 56px)", highlight }: { width?: number | string; highlight?: boolean }) {
  const w = typeof width === "number" ? `${width}px` : width;
  return (
    <div
      aria-hidden
      style={{ width: w, height: `calc(${w} * 1.4)` }}
      className={`shrink-0 rounded-card border-2 border-dashed transition-colors ${
        highlight ? "border-gold/70 bg-gold/10" : "border-white/20 bg-black/10"
      }`}
    />
  );
}
