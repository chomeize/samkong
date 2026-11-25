import { describe, expect, it } from "vitest";
import { compareHands, describeHand, HandCategory } from "../src/index.js";
import { hand } from "./helpers.js";

const cmp = (a: string, b: string) => Math.sign(compareHands(hand(a), hand(b)));

describe("5-card categories (AC-04)", () => {
  it.each([
    ["TS JS QS KS AS", HandCategory.StraightFlush, "Royal Flush"],
    ["5H 6H 7H 8H 9H", HandCategory.StraightFlush, "Straight Flush, Nine high"],
    ["AD 2D 3D 4D 5D", HandCategory.StraightFlush, "Straight Flush, Five high"],
    ["9S 9H 9D 9C 2S", HandCategory.FourOfAKind, "Four of a Kind, Nines"],
    ["KS KH KD 5C 5S", HandCategory.FullHouse, "Full House, Kings over Fives"],
    ["2C 7C 9C JC KC", HandCategory.Flush, "Flush, King high"],
    ["TS JH QD KC AS", HandCategory.Straight, "Straight, Ace high"],
    ["AS 2H 3D 4C 5S", HandCategory.Straight, "Straight, Five high"],
    ["7S 7H 7D KC 2S", HandCategory.ThreeOfAKind, "Three of a Kind, Sevens"],
    ["KS KH 5D 5C 2S", HandCategory.TwoPair, "Two Pair, Kings and Fives"],
    ["KS KH 9D 5C 2S", HandCategory.OnePair, "Pair of Kings"],
    ["AS JH 9D 5C 2S", HandCategory.HighCard, "High Card, Ace"],
  ])("%s → %s", (cards, category, name) => {
    const v = hand(cards);
    expect(v.category).toBe(category);
    expect(describeHand(v)).toBe(name);
  });

  it("flags only the ace-high straight flush as royal", () => {
    expect(hand("TS JS QS KS AS").isRoyal).toBe(true);
    expect(hand("9S TS JS QS KS").isRoyal).toBe(false);
  });

  it("does not wrap around: K-A-2-3-4 is high card", () => {
    expect(hand("KS AH 2D 3C 4S").category).toBe(HandCategory.HighCard);
    expect(hand("KS AS 2S 3S 4S").category).toBe(HandCategory.Flush);
  });
});

describe("front hand (3 cards)", () => {
  it.each([
    ["QS QH QD", HandCategory.ThreeOfAKind],
    ["QS QH 4D", HandCategory.OnePair],
    ["QS 9H 4D", HandCategory.HighCard],
    ["4S 5S 6S", HandCategory.HighCard], // 3-card straight flush is not a straight or flush
    ["QH JH 2H", HandCategory.HighCard],
    ["AS 2H 3D", HandCategory.HighCard],
  ])("%s → category %i", (cards, category) => {
    expect(hand(cards).category).toBe(category);
  });
});

describe("tie-breakers (AC-04)", () => {
  it("A-2-3-4-5 is the lowest straight; 10-J-Q-K-A the highest", () => {
    expect(cmp("AS 2H 3D 4C 5S", "2S 3H 4D 5C 6S")).toBe(-1);
    expect(cmp("TS JH QD KC AS", "9S TH JD QC KS")).toBe(1);
    expect(cmp("AD 2D 3D 4D 5D", "2C 3C 4C 5C 6C")).toBe(-1);
  });

  it("royal flush beats every other straight flush", () => {
    expect(cmp("TS JS QS KS AS", "9H TH JH QH KH")).toBe(1);
  });

  it("four of a kind: quads, then kicker", () => {
    expect(cmp("9S 9H 9D 9C 2S", "8S 8H 8D 8C AS")).toBe(1);
  });

  it("full house: trips first, then pair", () => {
    expect(cmp("KS KH KD 2C 2S", "QS QH QD AC AS")).toBe(1);
    expect(cmp("KS KH KD 5C 5S", "KC KH KD 4C 4S")).toBe(1); // same trips rank only possible across decks; checks pair fallback
  });

  it("flush compares every card from the top", () => {
    expect(cmp("AC JC 9C 6C 3C", "AD JD 9D 6D 2D")).toBe(1);
    expect(cmp("AC JC 9C 6C 3C", "AD QD 4D 3D 2D")).toBe(-1);
  });

  it("three of a kind: trips, then kickers", () => {
    expect(cmp("7S 7H 7D KC 2S", "6S 6H 6D AC KS")).toBe(1);
  });

  it("two pair: high pair, low pair, then kicker", () => {
    expect(cmp("KS KH 5D 5C 2S", "QS QH JD JC AS")).toBe(1);
    expect(cmp("KS KH 5D 5C 2S", "KC KD 4D 4C AS")).toBe(1);
    expect(cmp("KS KH 5D 5C 3S", "KC KD 5H 5S 2C")).toBe(1);
  });

  it("one pair: pair rank, then kickers high to low", () => {
    expect(cmp("KS KH 9D 5C 2S", "KC KD 9H 4C 3S")).toBe(1);
    expect(cmp("QS QH AD KC JS", "KC KD 4H 3C 2S")).toBe(-1);
  });

  it("high card compares one by one", () => {
    expect(cmp("AS JH 9D 5C 3S", "AH JD 9C 5S 2H")).toBe(1);
  });

  it("suits never break ties → draw", () => {
    expect(cmp("AS KH 9D 5C 3S", "AH KD 9C 5S 3H")).toBe(0);
    expect(cmp("2C 7C 9C JC KC", "2D 7D 9D JD KD")).toBe(0);
    expect(cmp("QS QH 4D", "QC QD 4S")).toBe(0);
  });

  it("compares 3-card and 5-card hands with 0-padded kickers", () => {
    expect(cmp("KS KH 9D", "KC KD 8H 7C 6S")).toBe(1);
    expect(cmp("KS KH 9D", "KC KD 9H 7C 6S")).toBe(-1);
    expect(cmp("QS QH QD", "2S 2H 3D 3C 4S")).toBe(1);
    expect(cmp("AS KH QD", "AC KD QH 3C 2S")).toBe(-1);
  });
});
