import { parseCards, type Arrangement, evaluateArrangement, evaluateHand } from "../src/index.js";

export const hand = (s: string) => evaluateHand(parseCards(s));

export const arr = (front: string, middle: string, back: string): Arrangement => ({
  front: parseCards(front),
  middle: parseCards(middle),
  back: parseCards(back),
});

export const evalArr = (front: string, middle: string, back: string) => evaluateArrangement(arr(front, middle, back));

/** Deterministic PRNG for reproducible fuzz tests. */
export function seededRandomInt(seed: number) {
  let a = seed >>> 0;
  return (max: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
  };
}
