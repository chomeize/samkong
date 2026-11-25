import { ROWS, type EvaluatedArrangement, type Row } from "./arrangement.js";
import { compareHands } from "./evaluate.js";
import { arrangementRoyalty, DEFAULT_ROYALTY_TABLE, type RoyaltyTable } from "./royalty.js";

export interface ScoringOptions {
  /** Win all 3 rows against an opponent → extra `scoopBonusPoints`. Default on. */
  enableScoopBonus: boolean;
  /** Add royalty difference to each pair. Default off. */
  enableRoyaltyBonus: boolean;
  scoopBonusPoints: number;
  /** Paid by a fouled player to each clean opponent (spec 4.3: 6). */
  foulPenalty: number;
  royaltyTable: RoyaltyTable;
}

export const DEFAULT_SCORING_OPTIONS: ScoringOptions = {
  enableScoopBonus: true,
  enableRoyaltyBonus: false,
  scoopBonusPoints: 3,
  foulPenalty: 6,
  royaltyTable: DEFAULT_ROYALTY_TABLE,
};

export type RowOutcome = 1 | 0 | -1;

/** One pairwise comparison. Every number is from player A's side; B gets the negation. */
export interface PairwiseResult {
  playerA: string;
  playerB: string;
  /** Row outcomes for A; null when either player fouled (rows aren't compared). */
  rows: Record<Row, RowOutcome> | null;
  aFoul: boolean;
  bFoul: boolean;
  /** Who won all 3 rows against the other, if anyone. */
  scoopedBy: "A" | "B" | null;
  base: number;
  scoop: number;
  foul: number;
  royalty: number;
  total: number;
}

export interface PlayerRoundScore {
  playerId: string;
  base: number;
  scoop: number;
  royalty: number;
  foul: number;
  total: number;
  isFoul: boolean;
  /** Royalty this player's hand earned (0 when fouled or royalties are off). */
  royaltyEarned: number;
  /** Number of opponents this player scooped this round. */
  scoops: number;
}

export interface RoundScoreResult {
  pairwise: PairwiseResult[];
  players: Record<string, PlayerRoundScore>;
}

export interface ScoringEntry {
  playerId: string;
  hand: EvaluatedArrangement;
}

const sign = (n: number): RowOutcome => (n > 0 ? 1 : n < 0 ? -1 : 0);

export function scorePair(
  a: ScoringEntry,
  b: ScoringEntry,
  options: ScoringOptions = DEFAULT_SCORING_OPTIONS,
): PairwiseResult {
  const royA = options.enableRoyaltyBonus ? arrangementRoyalty(a.hand, options.royaltyTable).total : 0;
  const royB = options.enableRoyaltyBonus ? arrangementRoyalty(b.hand, options.royaltyTable).total : 0;
  const result: PairwiseResult = {
    playerA: a.playerId, playerB: b.playerId,
    rows: null, aFoul: a.hand.isFoul, bFoul: b.hand.isFoul, scoopedBy: null,
    base: 0, scoop: 0, foul: 0, royalty: 0, total: 0,
  };

  if (a.hand.isFoul && b.hand.isFoul) return result;

  if (a.hand.isFoul || b.hand.isFoul) {
    // The clean player gets the foul penalty plus their own royalty; the fouled player earns no royalty.
    const aWins = b.hand.isFoul;
    result.foul = aWins ? options.foulPenalty : -options.foulPenalty;
    result.royalty = aWins ? royA : -royB;
  } else {
    const rows = {} as Record<Row, RowOutcome>;
    for (const row of ROWS) rows[row] = sign(compareHands(a.hand[row], b.hand[row]));
    result.rows = rows;
    result.base = rows.front + rows.middle + rows.back;
    if (Math.abs(result.base) === 3) {
      result.scoopedBy = result.base > 0 ? "A" : "B";
      if (options.enableScoopBonus) result.scoop = Math.sign(result.base) * options.scoopBonusPoints;
    }
    result.royalty = royA - royB;
  }

  result.total = result.base + result.scoop + result.foul + result.royalty;
  return result;
}

/**
 * Score a round: every pair of players is compared once (4 players → 6 pairs),
 * and the pair results are summed per player. The totals always add up to 0.
 */
export function scoreRound(
  entries: readonly ScoringEntry[],
  options: ScoringOptions = DEFAULT_SCORING_OPTIONS,
): RoundScoreResult {
  const ids = new Set(entries.map((e) => e.playerId));
  if (ids.size !== entries.length) throw new Error("Duplicate playerId in scoreRound");

  const players: Record<string, PlayerRoundScore> = {};
  for (const e of entries) {
    players[e.playerId] = {
      playerId: e.playerId, base: 0, scoop: 0, royalty: 0, foul: 0, total: 0,
      isFoul: e.hand.isFoul,
      royaltyEarned: options.enableRoyaltyBonus ? arrangementRoyalty(e.hand, options.royaltyTable).total : 0,
      scoops: 0,
    };
  }

  const pairwise: PairwiseResult[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const r = scorePair(entries[i]!, entries[j]!, options);
      pairwise.push(r);
      const pa = players[r.playerA]!;
      const pb = players[r.playerB]!;
      for (const k of ["base", "scoop", "foul", "royalty", "total"] as const) {
        pa[k] += r[k];
        pb[k] -= r[k];
      }
      if (r.scoopedBy === "A") pa.scoops++;
      if (r.scoopedBy === "B") pb.scoops++;
    }
  }
  return { pairwise, players };
}
