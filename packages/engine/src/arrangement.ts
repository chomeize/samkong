import type { Card } from "./cards.js";
import { compareHands, evaluateFive, evaluateThree, type HandValue } from "./evaluate.js";

export const ROWS = ["front", "middle", "back"] as const;
export type Row = (typeof ROWS)[number];
export const ROW_SIZES: Record<Row, 3 | 5> = { front: 3, middle: 5, back: 5 };

export interface Arrangement {
  front: Card[];
  middle: Card[];
  back: Card[];
}

export type ArrangementError =
  | { code: "WRONG_COUNT"; row: Row; expected: number; actual: number }
  | { code: "DUPLICATE_CARD"; cardId: string }
  | { code: "CARD_NOT_DEALT"; cardId: string };

/**
 * Check that an arrangement uses exactly the dealt cards: 3/5/5, no duplicates,
 * nothing that wasn't dealt to this player. Returns every problem found.
 */
export function validateArrangementCards(
  arrangement: Arrangement,
  dealt: readonly Card[],
): ArrangementError[] {
  const errors: ArrangementError[] = [];
  for (const row of ROWS) {
    const actual = arrangement[row]?.length ?? 0;
    if (actual !== ROW_SIZES[row]) errors.push({ code: "WRONG_COUNT", row, expected: ROW_SIZES[row], actual });
  }
  const dealtIds = new Set(dealt.map((c) => c.id));
  const seen = new Set<string>();
  for (const row of ROWS) {
    for (const card of arrangement[row] ?? []) {
      if (seen.has(card.id)) errors.push({ code: "DUPLICATE_CARD", cardId: card.id });
      seen.add(card.id);
      if (!dealtIds.has(card.id)) errors.push({ code: "CARD_NOT_DEALT", cardId: card.id });
    }
  }
  return errors;
}

export type FoulReason = "FRONT_BEATS_MIDDLE" | "MIDDLE_BEATS_BACK";

export interface EvaluatedArrangement {
  front: HandValue;
  middle: HandValue;
  back: HandValue;
  isFoul: boolean;
  foulReasons: FoulReason[];
}

/** Evaluate a complete 3/5/5 arrangement. Foul when Back < Middle or Middle < Front. */
export function evaluateArrangement(arrangement: Arrangement): EvaluatedArrangement {
  const front = evaluateThree(arrangement.front);
  const middle = evaluateFive(arrangement.middle);
  const back = evaluateFive(arrangement.back);
  const foulReasons: FoulReason[] = [];
  if (compareHands(front, middle) > 0) foulReasons.push("FRONT_BEATS_MIDDLE");
  if (compareHands(middle, back) > 0) foulReasons.push("MIDDLE_BEATS_BACK");
  return { front, middle, back, isFoul: foulReasons.length > 0, foulReasons };
}

/**
 * Live feedback while arranging: evaluates each full row and checks order
 * between neighbouring full rows. Rows that aren't full yet are null.
 */
export function evaluatePartial(arrangement: Partial<Arrangement>): {
  front: HandValue | null;
  middle: HandValue | null;
  back: HandValue | null;
  complete: boolean;
  foulReasons: FoulReason[];
} {
  const full = (row: Row) => (arrangement[row]?.length ?? 0) === ROW_SIZES[row];
  const front = full("front") ? evaluateThree(arrangement.front!) : null;
  const middle = full("middle") ? evaluateFive(arrangement.middle!) : null;
  const back = full("back") ? evaluateFive(arrangement.back!) : null;
  const foulReasons: FoulReason[] = [];
  if (front && middle && compareHands(front, middle) > 0) foulReasons.push("FRONT_BEATS_MIDDLE");
  if (middle && back && compareHands(middle, back) > 0) foulReasons.push("MIDDLE_BEATS_BACK");
  return { front, middle, back, complete: !!(front && middle && back), foulReasons };
}
