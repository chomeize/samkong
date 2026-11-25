export const SUITS = ["S", "H", "D", "C"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type Rank = (typeof RANKS)[number];

/** A playing card. `id` is rank char + suit char, e.g. "AS", "TD", "2C". */
export interface Card {
  readonly id: string;
  readonly rank: Rank;
  readonly suit: Suit;
}

const RANK_CHARS: Record<Rank, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "T", 11: "J", 12: "Q", 13: "K", 14: "A",
};
const CHAR_TO_RANK: Record<string, Rank> = Object.fromEntries(
  Object.entries(RANK_CHARS).map(([r, c]) => [c, Number(r) as Rank]),
);

export function rankChar(rank: Rank): string {
  return RANK_CHARS[rank];
}

export function makeCard(rank: Rank, suit: Suit): Card {
  return { id: RANK_CHARS[rank] + suit, rank, suit };
}

/** Parse "AS", "TD", "10H" (case-insensitive). Throws on malformed input. */
export function parseCard(text: string): Card {
  const t = text.trim().toUpperCase().replace(/^10/, "T");
  if (t.length !== 2) throw new Error(`Invalid card: "${text}"`);
  const rank = CHAR_TO_RANK[t[0]!];
  const suit = t[1] as Suit;
  if (!rank || !SUITS.includes(suit)) throw new Error(`Invalid card: "${text}"`);
  return makeCard(rank, suit);
}

/** Parse a whitespace-separated list such as "AS KS QS". */
export function parseCards(text: string): Card[] {
  return text.trim().split(/\s+/).filter(Boolean).map(parseCard);
}

export function isValidCardId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  try {
    return parseCard(id).id === id;
  } catch {
    return false;
  }
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(rank, suit));
  return deck;
}

/** Returns a uniformly random integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

/**
 * Cryptographically secure random integer using rejection sampling,
 * so every value is equally likely (no modulo bias).
 */
export const secureRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
    throw new RangeError(`maxExclusive must be an integer in 1..2^32, got ${maxExclusive}`);
  }
  const limit = Math.floor(2 ** 32 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const x = buf[0]!;
    if (x < limit) return x % maxExclusive;
  }
};

/** Fisher–Yates shuffle. Returns a new array; the input is not modified. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt = secureRandomInt): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export const CARDS_PER_PLAYER = 13;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/**
 * Shuffle a fresh 52-card deck and deal 13 cards to each player.
 * Cards beyond `playerCount * 13` are not used this round.
 */
export function dealHands(playerCount: number, randomInt: RandomInt = secureRandomInt): Card[][] {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new RangeError(`playerCount must be ${MIN_PLAYERS}-${MAX_PLAYERS}, got ${playerCount}`);
  }
  const deck = shuffle(createDeck(), randomInt);
  return Array.from({ length: playerCount }, (_, i) =>
    deck.slice(i * CARDS_PER_PLAYER, (i + 1) * CARDS_PER_PLAYER),
  );
}

export function sortByRank(cards: readonly Card[]): Card[] {
  return cards.slice().sort((a, b) => b.rank - a.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
}

export function sortBySuit(cards: readonly Card[]): Card[] {
  return cards.slice().sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || b.rank - a.rank);
}
