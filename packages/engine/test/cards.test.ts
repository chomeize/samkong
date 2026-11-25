import { describe, expect, it } from "vitest";
import {
  createDeck, dealHands, isValidCardId, parseCard, secureRandomInt, shuffle, sortByRank, sortBySuit, parseCards,
} from "../src/index.js";
import { seededRandomInt } from "./helpers.js";

describe("deck", () => {
  it("has 52 unique cards and no jokers", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
  });

  it("parses card ids including 10", () => {
    expect(parseCard("AS")).toMatchObject({ rank: 14, suit: "S", id: "AS" });
    expect(parseCard("10h")).toMatchObject({ rank: 10, suit: "H", id: "TH" });
    expect(() => parseCard("1S")).toThrow();
    expect(() => parseCard("AX")).toThrow();
    expect(isValidCardId("QD")).toBe(true);
    expect(isValidCardId("qd")).toBe(false);
    expect(isValidCardId(42)).toBe(false);
  });
});

describe("shuffle and deal (AC-02)", () => {
  it.each([2, 3, 4])("deals 13 unique cards to each of %i players", (n) => {
    const hands = dealHands(n);
    expect(hands).toHaveLength(n);
    for (const h of hands) expect(h).toHaveLength(13);
    const all = hands.flat().map((c) => c.id);
    expect(new Set(all).size).toBe(n * 13);
  });

  it("rejects fewer than 2 or more than 4 players", () => {
    expect(() => dealHands(1)).toThrow();
    expect(() => dealHands(5)).toThrow();
  });

  it("does not modify the input and keeps the same cards", () => {
    const deck = createDeck();
    const copy = deck.slice();
    const out = shuffle(deck, seededRandomInt(7));
    expect(deck).toEqual(copy);
    expect(out.map((c) => c.id).sort()).toEqual(copy.map((c) => c.id).sort());
  });

  it("secureRandomInt stays in range and covers all values", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const x = secureRandomInt(6);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(6);
      seen.add(x);
    }
    expect(seen.size).toBe(6);
    expect(() => secureRandomInt(0)).toThrow();
  });

  it("produces different orders across shuffles", () => {
    const a = shuffle(createDeck()).map((c) => c.id).join();
    const b = shuffle(createDeck()).map((c) => c.id).join();
    expect(a).not.toBe(b);
  });
});

describe("sorting", () => {
  const cards = parseCards("2H AS KD 2S TC");
  it("sorts by rank, high first", () => {
    expect(sortByRank(cards).map((c) => c.id)).toEqual(["AS", "KD", "TC", "2S", "2H"]);
  });
  it("sorts by suit, then rank", () => {
    expect(sortBySuit(cards).map((c) => c.id)).toEqual(["AS", "2S", "2H", "KD", "TC"]);
  });
});
