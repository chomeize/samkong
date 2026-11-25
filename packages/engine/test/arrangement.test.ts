import { describe, expect, it } from "vitest";
import {
  autoArrange, dealHands, evaluateArrangement, evaluatePartial, parseCards, validateArrangementCards,
} from "../src/index.js";
import { arr, evalArr, seededRandomInt } from "./helpers.js";

describe("foul detection (AC-04)", () => {
  it("accepts back ≥ middle ≥ front", () => {
    const e = evalArr("2S 3H 4D", "KS KH 9D 5C 2C", "AS AH AD 7C 7S");
    expect(e.isFoul).toBe(false);
    expect(e.foulReasons).toEqual([]);
  });

  it("allows equal strength between rows", () => {
    expect(evalArr("QS QH 4D", "QC QD 4S 3C 2C", "AS AH AD 7C 7S").isFoul).toBe(false);
  });

  it("fouls when the front beats the middle", () => {
    const e = evalArr("QS QH QD", "KS KH 5D 5C 2C", "AS AH AD 7C 7S");
    expect(e.isFoul).toBe(true);
    expect(e.foulReasons).toEqual(["FRONT_BEATS_MIDDLE"]);
  });

  it("fouls on a kicker: front pair of kings with a 9 vs middle kings with an 8", () => {
    const e = evalArr("KS KH 9D", "KC KD 8H 7C 6S", "AS AH AD 7D 7H");
    expect(e.foulReasons).toEqual(["FRONT_BEATS_MIDDLE"]);
  });

  it("fouls when the middle beats the back", () => {
    const e = evalArr("2S 3H 4D", "AS AH AD 7C 7S", "KS KH 9D 5C 2C");
    expect(e.foulReasons).toEqual(["MIDDLE_BEATS_BACK"]);
  });

  it("reports both reasons", () => {
    const e = evalArr("AS AH AD", "KS KH 9D 5C 2C", "QS JH 9C 5D 3C");
    expect(e.foulReasons).toEqual(["FRONT_BEATS_MIDDLE", "MIDDLE_BEATS_BACK"]);
  });

  it("gives live feedback on partial arrangements", () => {
    const p = evaluatePartial({ front: parseCards("AS AH AD"), middle: parseCards("KS KH 9D 5C 2C"), back: [] });
    expect(p.complete).toBe(false);
    expect(p.back).toBeNull();
    expect(p.foulReasons).toEqual(["FRONT_BEATS_MIDDLE"]);
  });
});

describe("arrangement card validation (AC-03)", () => {
  const dealt = parseCards("2S 3H 4D KS KH 9D 5C 2C AS AH AD 7C 7S");

  it("accepts exactly the dealt cards in 3/5/5", () => {
    expect(validateArrangementCards(arr("2S 3H 4D", "KS KH 9D 5C 2C", "AS AH AD 7C 7S"), dealt)).toEqual([]);
  });

  it("rejects too many cards in a row", () => {
    const errors = validateArrangementCards(arr("2S 3H 4D KS", "KH 9D 5C 2C", "AS AH AD 7C 7S"), dealt);
    expect(errors).toContainEqual({ code: "WRONG_COUNT", row: "front", expected: 3, actual: 4 });
  });

  it("rejects a duplicated card", () => {
    const errors = validateArrangementCards(arr("2S 2S 4D", "KS KH 9D 5C 2C", "AS AH AD 7C 7S"), dealt);
    expect(errors).toContainEqual({ code: "DUPLICATE_CARD", cardId: "2S" });
  });

  it("rejects a card that wasn't dealt", () => {
    const errors = validateArrangementCards(arr("2S 3H QD", "KS KH 9D 5C 2C", "AS AH AD 7C 7S"), dealt);
    expect(errors).toContainEqual({ code: "CARD_NOT_DEALT", cardId: "QD" });
  });
});

describe("auto arrange (FR-08)", () => {
  it("always returns a valid, non-fouled arrangement of the same 13 cards", () => {
    const rand = seededRandomInt(2024);
    for (let round = 0; round < 25; round++) {
      for (const dealt of dealHands(4, rand)) {
        const a = autoArrange(dealt);
        expect(validateArrangementCards(a, dealt)).toEqual([]);
        expect(evaluateArrangement(a).isFoul).toBe(false);
      }
    }
  });

  it("keeps an obvious strong hand together", () => {
    const dealt = parseCards("AS KS QS JS TS 9H 9D 9C 4S 4H 2D 3C 7D");
    const e = evaluateArrangement(autoArrange(dealt));
    expect(e.back.isRoyal).toBe(true);
    expect(e.isFoul).toBe(false);
  });
});
