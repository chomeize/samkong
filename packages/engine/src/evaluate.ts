import type { Card, Rank } from "./cards.js";

/** Hand categories on one shared scale, so 3-card and 5-card hands compare directly. */
export enum HandCategory {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export interface HandValue {
  category: HandCategory;
  /** Royal Flush is the top Straight Flush; flagged for display and royalty only. */
  isRoyal: boolean;
  /**
   * Tie-break vector, compared left to right after the category.
   * Straights use only the high card (5 for A-2-3-4-5).
   */
  ranks: number[];
  /** Number of cards evaluated (3 or 5). */
  size: 3 | 5;
}

const RANK_NAMES: Record<number, [string, string]> = {
  2: ["Two", "Twos"], 3: ["Three", "Threes"], 4: ["Four", "Fours"], 5: ["Five", "Fives"],
  6: ["Six", "Sixes"], 7: ["Seven", "Sevens"], 8: ["Eight", "Eights"], 9: ["Nine", "Nines"],
  10: ["Ten", "Tens"], 11: ["Jack", "Jacks"], 12: ["Queen", "Queens"], 13: ["King", "Kings"],
  14: ["Ace", "Aces"],
};

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: "High Card",
  [HandCategory.OnePair]: "One Pair",
  [HandCategory.TwoPair]: "Two Pair",
  [HandCategory.ThreeOfAKind]: "Three of a Kind",
  [HandCategory.Straight]: "Straight",
  [HandCategory.Flush]: "Flush",
  [HandCategory.FullHouse]: "Full House",
  [HandCategory.FourOfAKind]: "Four of a Kind",
  [HandCategory.StraightFlush]: "Straight Flush",
};

/** Groups ranks by count: [[count, rank], ...] sorted by count desc, then rank desc. */
function groupRanks(cards: readonly Card[]): Array<[number, Rank]> {
  const counts = new Map<Rank, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  return [...counts.entries()]
    .map(([rank, count]) => [count, rank] as [number, Rank])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
}

/** High card of a 5-card straight, or 0. A-2-3-4-5 returns 5; K-A-2-3-4 is not a straight. */
function straightHigh(sortedDesc: readonly number[]): number {
  const unique = new Set(sortedDesc);
  if (unique.size !== 5) return 0;
  if (sortedDesc[0]! - sortedDesc[4]! === 4) return sortedDesc[0]!;
  if (sortedDesc[0] === 14 && sortedDesc[1] === 5 && sortedDesc[4] === 2) return 5;
  return 0;
}

export function evaluateFive(cards: readonly Card[]): HandValue {
  if (cards.length !== 5) throw new RangeError(`evaluateFive needs 5 cards, got ${cards.length}`);
  const ranks = cards.map((c) => c.rank as number).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0]!.suit);
  const high = straightHigh(ranks);
  const groups = groupRanks(cards);
  const byGroup = groups.map(([, r]) => r as number);
  const [top, second] = [groups[0]![0], groups[1]?.[0] ?? 0];
  const v = (category: HandCategory, r: number[], isRoyal = false): HandValue => ({
    category, ranks: r, isRoyal, size: 5,
  });

  if (high && flush) return v(HandCategory.StraightFlush, [high], high === 14);
  if (top === 4) return v(HandCategory.FourOfAKind, byGroup);
  if (top === 3 && second === 2) return v(HandCategory.FullHouse, byGroup);
  if (flush) return v(HandCategory.Flush, ranks);
  if (high) return v(HandCategory.Straight, [high]);
  if (top === 3) return v(HandCategory.ThreeOfAKind, byGroup);
  if (top === 2 && second === 2) return v(HandCategory.TwoPair, byGroup);
  if (top === 2) return v(HandCategory.OnePair, byGroup);
  return v(HandCategory.HighCard, ranks);
}

/** Front hand: only Three of a Kind, One Pair or High Card. 3-card straights/flushes don't count. */
export function evaluateThree(cards: readonly Card[]): HandValue {
  if (cards.length !== 3) throw new RangeError(`evaluateThree needs 3 cards, got ${cards.length}`);
  const groups = groupRanks(cards);
  const byGroup = groups.map(([, r]) => r as number);
  const top = groups[0]![0];
  const category =
    top === 3 ? HandCategory.ThreeOfAKind : top === 2 ? HandCategory.OnePair : HandCategory.HighCard;
  return { category, ranks: byGroup, isRoyal: false, size: 3 };
}

export function evaluateHand(cards: readonly Card[]): HandValue {
  if (cards.length === 3) return evaluateThree(cards);
  if (cards.length === 5) return evaluateFive(cards);
  throw new RangeError(`A hand must have 3 or 5 cards, got ${cards.length}`);
}

/**
 * Compare two hand values. Positive if `a` is stronger, negative if weaker, 0 for a draw.
 * Rank vectors of different lengths are padded with 0 (spec 3.4), which makes
 * front (3 cards) vs middle (5 cards) comparisons deterministic.
 */
export function compareHands(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  const n = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < n; i++) {
    const d = (a.ranks[i] ?? 0) - (b.ranks[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** English description for UI, e.g. "Pair of Kings", "Full House, Kings over Fives". */
export function describeHand(v: HandValue): string {
  const one = (r: number) => RANK_NAMES[r]![0];
  const many = (r: number) => RANK_NAMES[r]![1];
  const [a, b] = v.ranks;
  switch (v.category) {
    case HandCategory.StraightFlush:
      return v.isRoyal ? "Royal Flush" : `Straight Flush, ${one(a!)} high`;
    case HandCategory.FourOfAKind: return `Four of a Kind, ${many(a!)}`;
    case HandCategory.FullHouse: return `Full House, ${many(a!)} over ${many(b!)}`;
    case HandCategory.Flush: return `Flush, ${one(a!)} high`;
    case HandCategory.Straight: return `Straight, ${one(a!)} high`;
    case HandCategory.ThreeOfAKind: return `Three of a Kind, ${many(a!)}`;
    case HandCategory.TwoPair: return `Two Pair, ${many(a!)} and ${many(b!)}`;
    case HandCategory.OnePair: return `Pair of ${many(a!)}`;
    case HandCategory.HighCard: return `High Card, ${one(a!)}`;
  }
}
