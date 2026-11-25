import { parseCard, ROW_SIZES, sortByRank, sortBySuit, type Row } from "@sam-kong/engine";
import type { ArrangementDTO, CardId } from "@sam-kong/protocol";

export type Zone = Row | "hand";
export type SortMode = "rank" | "suit";

export const emptyDraft = (): ArrangementDTO => ({ front: [], middle: [], back: [] });

export function locate(draft: ArrangementDTO, id: CardId): Zone {
  if (draft.front.includes(id)) return "front";
  if (draft.middle.includes(id)) return "middle";
  if (draft.back.includes(id)) return "back";
  return "hand";
}

/** Cards not placed in any row, sorted for display. */
export function handCards(dealt: CardId[], draft: ArrangementDTO, mode: SortMode): CardId[] {
  const placed = new Set([...draft.front, ...draft.middle, ...draft.back]);
  const rest = dealt.filter((id) => !placed.has(id)).map(parseCard);
  return (mode === "rank" ? sortByRank(rest) : sortBySuit(rest)).map((c) => c.id);
}

export function placedCount(draft: ArrangementDTO) {
  return draft.front.length + draft.middle.length + draft.back.length;
}

const clone = (d: ArrangementDTO): ArrangementDTO => ({ front: [...d.front], middle: [...d.middle], back: [...d.back] });

/** Move a card to a zone. Returns null when the target row is full. */
export function moveCard(draft: ArrangementDTO, id: CardId, to: Zone): ArrangementDTO | null {
  const from = locate(draft, id);
  if (from === to) return draft;
  if (to !== "hand" && draft[to].length >= ROW_SIZES[to]) return null;
  const next = clone(draft);
  if (from !== "hand") next[from] = next[from].filter((c) => c !== id);
  if (to !== "hand") next[to].push(id);
  return next;
}

/** Swap two cards' places (between rows, or a row and the hand). Row sizes never change. */
export function swapCards(draft: ArrangementDTO, a: CardId, b: CardId): ArrangementDTO {
  const za = locate(draft, a);
  const zb = locate(draft, b);
  const next = clone(draft);
  if (za === zb) {
    if (za === "hand") return draft;
    const row = next[za];
    const ia = row.indexOf(a);
    const ib = row.indexOf(b);
    row[ia] = b;
    row[ib] = a;
    return next;
  }
  if (za !== "hand") next[za][next[za].indexOf(a)] = b;
  if (zb !== "hand") next[zb][next[zb].indexOf(b)] = a;
  return next;
}

/** Validate that a draft only uses the dealt cards (protects against stale state after a new deal). */
export function sanitizeDraft(draft: ArrangementDTO, dealt: CardId[]): ArrangementDTO {
  const ok = new Set(dealt);
  const seen = new Set<string>();
  const keep = (row: Row) =>
    draft[row].filter((id) => ok.has(id) && !seen.has(id) && seen.add(id)).slice(0, ROW_SIZES[row]);
  return { front: keep("front"), middle: keep("middle"), back: keep("back") };
}
