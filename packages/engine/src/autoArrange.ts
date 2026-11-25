import type { Card } from "./cards.js";
import { CARDS_PER_PLAYER } from "./cards.js";
import type { Arrangement } from "./arrangement.js";
import { compareHands, evaluateFive, evaluateThree, type HandValue } from "./evaluate.js";

const comboCache = new Map<string, number[][]>();
function combinations(n: number, k: number): number[][] {
  const key = `${n}:${k}`;
  const cached = comboCache.get(key);
  if (cached) return cached;
  const out: number[][] = [];
  const cur: number[] = [];
  const go = (start: number) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < n; i++) { cur.push(i); go(i + 1); cur.pop(); }
  };
  go(0);
  comboCache.set(key, out);
  return out;
}

/** Rough strength: category plus a small share of the top tie-break rank. */
const strength = (v: HandValue) => v.category + (v.ranks[0] ?? 0) / 20;

/** Weights favour stronger middle and front rows, since a strong back usually comes for free. */
const WEIGHTS = { back: 1, middle: 1.4, front: 2.2 };

/**
 * Find a valid (never fouled) arrangement of 13 cards.
 * Exhaustive over all 1287 × 56 splits, scored with a simple heuristic.
 * Aims for a reasonable hand, not the optimal strategy (spec FR-08 MVP).
 */
export function autoArrange(cards: readonly Card[]): Arrangement {
  if (cards.length !== CARDS_PER_PLAYER) throw new RangeError(`autoArrange needs 13 cards, got ${cards.length}`);
  if (new Set(cards.map((c) => c.id)).size !== cards.length) throw new Error("autoArrange: duplicate cards");

  let best: Arrangement | null = null;
  let bestScore = -Infinity;

  for (const backIdx of combinations(13, 5)) {
    const back = backIdx.map((i) => cards[i]!);
    const rest = cards.filter((_, i) => !backIdx.includes(i));
    const backV = evaluateFive(back);
    for (const midIdx of combinations(8, 5)) {
      const middle = midIdx.map((i) => rest[i]!);
      const midV = evaluateFive(middle);
      if (compareHands(midV, backV) > 0) continue;
      const front = rest.filter((_, i) => !midIdx.includes(i));
      const frontV = evaluateThree(front);
      if (compareHands(frontV, midV) > 0) continue;
      const score = strength(backV) * WEIGHTS.back + strength(midV) * WEIGHTS.middle + strength(frontV) * WEIGHTS.front;
      if (score > bestScore) {
        bestScore = score;
        best = { front, middle, back };
      }
    }
  }
  // Unreachable in practice: taking the strongest 5 for back, next strongest 5 for middle is always valid.
  if (!best) throw new Error("autoArrange: no valid arrangement found");
  return best;
}
