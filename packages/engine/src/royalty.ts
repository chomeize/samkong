import type { EvaluatedArrangement, Row } from "./arrangement.js";
import { HandCategory, type HandValue } from "./evaluate.js";

export type RoyaltyHand =
  | "ThreeOfAKind"
  | "Straight"
  | "Flush"
  | "FullHouse"
  | "FourOfAKind"
  | "StraightFlush"
  | "RoyalFlush";

/** Points per row and hand type. Kept separate from the scoring engine so values can change. */
export type RoyaltyTable = Record<Row, Partial<Record<RoyaltyHand, number>>>;

/** Spec 4.5 defaults. */
export const DEFAULT_ROYALTY_TABLE: RoyaltyTable = {
  front: { ThreeOfAKind: 3 },
  middle: { Straight: 4, Flush: 8, FullHouse: 12, FourOfAKind: 20, StraightFlush: 30, RoyalFlush: 50 },
  back: { Straight: 2, Flush: 4, FullHouse: 6, FourOfAKind: 10, StraightFlush: 15, RoyalFlush: 25 },
};

export function royaltyHandOf(v: HandValue): RoyaltyHand | null {
  switch (v.category) {
    case HandCategory.StraightFlush: return v.isRoyal ? "RoyalFlush" : "StraightFlush";
    case HandCategory.FourOfAKind: return "FourOfAKind";
    case HandCategory.FullHouse: return "FullHouse";
    case HandCategory.Flush: return "Flush";
    case HandCategory.Straight: return "Straight";
    case HandCategory.ThreeOfAKind: return "ThreeOfAKind";
    default: return null;
  }
}

/** Royalty for one row. A Royal Flush gets only the Royal Flush value, never Straight Flush too. */
export function rowRoyalty(row: Row, v: HandValue, table: RoyaltyTable = DEFAULT_ROYALTY_TABLE): number {
  const hand = royaltyHandOf(v);
  return hand ? table[row][hand] ?? 0 : 0;
}

export interface RoyaltyBreakdown {
  front: number;
  middle: number;
  back: number;
  total: number;
}

/** Royalty for a whole arrangement. A fouled hand earns nothing. */
export function arrangementRoyalty(
  e: EvaluatedArrangement,
  table: RoyaltyTable = DEFAULT_ROYALTY_TABLE,
): RoyaltyBreakdown {
  if (e.isFoul) return { front: 0, middle: 0, back: 0, total: 0 };
  const front = rowRoyalty("front", e.front, table);
  const middle = rowRoyalty("middle", e.middle, table);
  const back = rowRoyalty("back", e.back, table);
  return { front, middle, back, total: front + middle + back };
}
