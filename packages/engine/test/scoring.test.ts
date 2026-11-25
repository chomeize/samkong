import { describe, expect, it } from "vitest";
import {
  arrangementRoyalty, autoArrange, DEFAULT_SCORING_OPTIONS, dealHands, evaluateArrangement,
  rowRoyalty, scorePair, scoreRound, shuffle, ROWS, type EvaluatedArrangement, type ScoringOptions,
} from "../src/index.js";
import { evalArr, hand, seededRandomInt } from "./helpers.js";

const P = (playerId: string, h: EvaluatedArrangement) => ({ playerId, hand: h });
const withOpts = (o: Partial<ScoringOptions>): ScoringOptions => ({ ...DEFAULT_SCORING_OPTIONS, ...o });

// Reference hands. Ordering of strength per row is chosen to produce each outcome.
const STRONG = evalArr("QS QH 4D", "KS KH 9D 9C 2C", "AS AH AD 7C 7S"); // pair Q / two pair / full house
const WEAK = evalArr("JS 8H 4C", "TS TH 6D 5C 3C", "KD KC 8D 8C 2S"); // J high / pair T / two pair
const MIXED = evalArr("KD KS 4C", "AC AD 6D 5C 3C", "8S 8H 8D 2C 2D"); // beats STRONG front only
const FOUL = evalArr("AS AH AD", "KS KH 9D 5C 2C", "QS JH 9C 5D 3C");
const FOUL2 = evalArr("KS KH KD", "QS QH 9D 5C 2C", "JS TH 9C 5D 3C");

describe("pairwise base & scoop (AC-05)", () => {
  it("win 3 rows = +6 with Scoop Bonus on", () => {
    const r = scorePair(P("A", STRONG), P("B", WEAK));
    expect(r.rows).toEqual({ front: 1, middle: 1, back: 1 });
    expect(r).toMatchObject({ base: 3, scoop: 3, total: 6, scoopedBy: "A" });
  });

  it("lose 3 rows = -6", () => {
    expect(scorePair(P("B", WEAK), P("A", STRONG)).total).toBe(-6);
  });

  it("win 3 rows = +3 with Scoop Bonus off", () => {
    const r = scorePair(P("A", STRONG), P("B", WEAK), withOpts({ enableScoopBonus: false }));
    expect(r).toMatchObject({ base: 3, scoop: 0, total: 3, scoopedBy: "A" });
  });

  it("win 2, lose 1 = +1", () => {
    const r = scorePair(P("A", STRONG), P("B", MIXED));
    expect(r.rows).toEqual({ front: -1, middle: 1, back: 1 });
    expect(r.total).toBe(1);
  });

  it("win 2, draw 1 = +2 (no scoop)", () => {
    const b = evalArr("QC QD 4S", "QS QH 5D 3C 2C", "KD KC 8D 8C 2S");
    const r = scorePair(P("A", STRONG), P("B", b));
    expect(r.rows).toEqual({ front: 0, middle: 1, back: 1 });
    expect(r).toMatchObject({ total: 2, scoop: 0, scoopedBy: null });
  });

  it("win 1, draw 2 = +1", () => {
    const b = evalArr("QC QD 4S", "KC KD 9H 9S 2D", "2H 2S 2D 3C 4D");
    const r = scorePair(P("A", STRONG), P("B", b));
    expect(r.rows).toEqual({ front: 0, middle: 0, back: 1 });
    expect(r.total).toBe(1);
  });

  it("win 1, lose 1, draw 1 = 0", () => {
    const b = evalArr("KS KH 3C", "KC KD 9H 9S 2D", "2H 2S 2D 3C 4D");
    const r = scorePair(P("A", STRONG), P("B", b));
    expect(r.rows).toEqual({ front: -1, middle: 0, back: 1 });
    expect(r.total).toBe(0);
  });
});

describe("foul scoring (AC-05)", () => {
  it("fouled player pays 6 to a clean player", () => {
    const r = scorePair(P("A", FOUL), P("B", WEAK));
    expect(r).toMatchObject({ rows: null, foul: -6, total: -6, base: 0, scoop: 0 });
  });

  it("foul penalty stays 6 with Scoop Bonus off (spec 4.3)", () => {
    expect(scorePair(P("A", WEAK), P("B", FOUL), withOpts({ enableScoopBonus: false })).total).toBe(6);
  });

  it("both fouled = 0", () => {
    expect(scorePair(P("A", FOUL), P("B", FOUL2)).total).toBe(0);
    expect(scorePair(P("A", FOUL), P("B", FOUL2), withOpts({ enableRoyaltyBonus: true })).total).toBe(0);
  });
});

describe("royalty (spec 4.5)", () => {
  it("uses the default table per row", () => {
    expect(rowRoyalty("front", hand("QS QH QD"))).toBe(3);
    expect(rowRoyalty("middle", hand("KS KH KD 2C 2S"))).toBe(12);
    expect(rowRoyalty("back", hand("KS KH KD 2C 2S"))).toBe(6);
    expect(rowRoyalty("back", hand("7S 7H 7D KC 2S"))).toBe(0);
  });

  it("counts a royal flush once, not also as a straight flush", () => {
    expect(rowRoyalty("middle", hand("TS JS QS KS AS"))).toBe(50);
    expect(rowRoyalty("back", hand("TS JS QS KS AS"))).toBe(25);
    expect(rowRoyalty("back", hand("9S TS JS QS KS"))).toBe(15);
  });

  it("gives nothing to a fouled hand", () => {
    expect(arrangementRoyalty(FOUL).total).toBe(0);
  });

  it("is off by default", () => {
    const strongRoyal = evalArr("2S 3H 4D", "5C 6C 7C 8C 9C", "TS JS QS KS AS");
    expect(scorePair(P("A", strongRoyal), P("B", WEAK)).royalty).toBe(0);
  });

  it("adds the royalty difference between clean players", () => {
    const a = evalArr("QS QH QD", "5C 6C 7C 8C 9C", "TS JS QS KS AS"); // invalid deck overlap is fine for engine math
    const r = scorePair(P("A", a), P("B", STRONG), withOpts({ enableRoyaltyBonus: true }));
    // A: front trips 3 + middle SF 30 + back royal 25 = 58; B (STRONG): back full house 6 → diff 52
    expect(r.royalty).toBe(52);
    expect(r.total).toBe(r.base + r.scoop + 52);
  });

  it("clean player gets 6 plus own royalty from a fouled player", () => {
    const r = scorePair(P("A", STRONG), P("B", FOUL), withOpts({ enableRoyaltyBonus: true }));
    expect(r).toMatchObject({ foul: 6, royalty: 6, total: 12 });
    const back = scorePair(P("B", FOUL), P("A", STRONG), withOpts({ enableRoyaltyBonus: true }));
    expect(back.total).toBe(-12);
  });
});

describe("multiplayer round (spec 4.4)", () => {
  it("compares all 6 pairs for 4 players and sums per player", () => {
    const res = scoreRound([P("A", STRONG), P("B", WEAK), P("C", MIXED), P("D", FOUL)]);
    expect(res.pairwise.map((p) => `${p.playerA}${p.playerB}`)).toEqual(["AB", "AC", "AD", "BC", "BD", "CD"]);
    expect(res.players.D).toMatchObject({ total: -18, foul: -18, isFoul: true });
    expect(res.players.A!.total).toBe(6 + 1 + 6);
    expect(res.players.A!.scoops).toBe(1);
    const sum = Object.values(res.players).reduce((s, p) => s + p.total, 0);
    expect(sum).toBe(0);
  });

  it("breakdown parts add up to each player's total", () => {
    const res = scoreRound([P("A", STRONG), P("B", WEAK), P("C", FOUL)], withOpts({ enableRoyaltyBonus: true }));
    for (const p of Object.values(res.players)) expect(p.base + p.scoop + p.foul + p.royalty).toBe(p.total);
  });

  it("rejects duplicate player ids", () => {
    expect(() => scoreRound([P("A", STRONG), P("A", WEAK)])).toThrow();
  });

  it("is always zero-sum across random rounds and settings", () => {
    const rand = seededRandomInt(99);
    for (let i = 0; i < 40; i++) {
      const n = 2 + (i % 3);
      const entries = dealHands(n, rand).map((cards, k) => {
        // Half the players auto-arrange, half play a random (often fouled) split.
        const order = k % 2 === 0 ? autoArrange(cards) : (() => {
          const s = shuffle(cards, rand);
          return { front: s.slice(0, 3), middle: s.slice(3, 8), back: s.slice(8) };
        })();
        return P(`p${k}`, evaluateArrangement(order));
      });
      for (const opts of [
        DEFAULT_SCORING_OPTIONS,
        withOpts({ enableScoopBonus: false }),
        withOpts({ enableRoyaltyBonus: true }),
      ]) {
        const res = scoreRound(entries, opts);
        expect(res.pairwise).toHaveLength((n * (n - 1)) / 2);
        expect(Object.values(res.players).reduce((s, p) => s + p.total, 0)).toBe(0);
        for (const pr of res.pairwise) if (pr.rows) for (const row of ROWS) expect([-1, 0, 1]).toContain(pr.rows[row]);
      }
    }
  });
});
