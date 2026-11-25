import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { describeHand, evaluatePartial, parseCard, ROW_SIZES, ROWS, type Row } from "@sam-kong/engine";
import type { ArrangementDTO, CardId } from "@sam-kong/protocol";
import { PlayingCard } from "../components/PlayingCard";
import { Sheet } from "../components/ui";
import { ShuffleIntro } from "../components/Celebration";
import { swapCards } from "../lib/arrange";
import { tap } from "../lib/haptics";
import { sound } from "../lib/sound";
import { useGame } from "../store/game";
import { t } from "../i18n";
import { TableShell } from "./table/TableShell";
import { OpponentChips } from "./table/OpponentChips";

/** Sizing for the waiting screen: piles on the left, a status panel on the right. */
export const LAYOUT_VARS = {
  "--panel-w": "clamp(170px, 26vw, 240px)",
  "--row-w": "max(32px, min(88px, calc((100dvh - 108px) / 4.6), calc((100vw - var(--panel-w) - 206px) / 5)))",
} as CSSProperties;

/**
 * Arrange screen sizing: the piles sit centred on the table. Card width follows the
 * visible height first (3 rows + status line), then the width, keeping ~140px clear on
 * each side so the corner buttons never cover a card.
 */
const ARRANGE_VARS = {
  "--row-w": "max(34px, min(92px, calc((100dvh - 118px) / 4.25), calc((100vw - 280px - 146px) / 5)))",
} as CSSProperties;

/** Deal order split 3/5/5: where the cards start, and what Reset goes back to. */
export const dealtLayout = (dealt: CardId[]): ArrangementDTO => ({
  front: dealt.slice(0, 3),
  middle: dealt.slice(3, 8),
  back: dealt.slice(8, 13),
});

/** Drops only ever land on another card: every move is a swap. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args).filter((h) => h.id !== args.active.id);
  if (hits.length) return hits.slice(0, 1);
  return rectIntersection(args).filter((h) => h.id !== args.active.id).slice(0, 1);
};

/** A card you can pick up and drop onto any other card to swap the two. */
function SwapCard({ id, dealIndex }: { id: CardId; dealIndex: number | null }) {
  const drag = useDraggable({ id, data: { cardId: id } });
  const drop = useDroppable({ id, data: { cardId: id } });
  const target = drop.isOver && !drag.isDragging;
  return (
    <motion.div
      initial={dealIndex !== null ? { y: -260, opacity: 0, rotate: -14 } : false}
      animate={{ y: 0, opacity: 1, rotate: 0 }}
      transition={{ delay: (dealIndex ?? 0) * 0.05, type: "spring", stiffness: 260, damping: 22 }}
    >
      <div
        ref={(el) => {
          drag.setNodeRef(el);
          drop.setNodeRef(el);
        }}
        {...drag.listeners}
        {...drag.attributes}
        aria-roledescription="ไพ่ที่ลากได้"
        // The card owns the gesture: no page scroll, zoom, text selection or iOS long-press menu.
        style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", cursor: "grab" } as CSSProperties}
        className={`rounded-card transition-transform duration-150 ${target ? "scale-105 ring-[3px] ring-gold ring-offset-2 ring-offset-felt" : ""}`}
      >
        <PlayingCard id={id} width="var(--row-w)" ghost={drag.isDragging} />
      </div>
    </motion.div>
  );
}

export type RowStatus = { text: string; tone: "dim" | "ok" | "bad" };

/** Row name and live hand name, shown to the left of each pile. */
export function RowLabel({ row, status }: { row: Row; count?: number; status: RowStatus }) {
  return (
    <div className="w-[92px] shrink-0 leading-tight">
      <div className="font-display text-sm font-semibold">
        {t.game.rows[row]} <span className="text-xs font-normal text-ink-dim">{ROW_SIZES[row]} ใบ</span>
      </div>
      <div
        className={`mt-0.5 text-[11px] font-semibold ${status.tone === "ok" ? "text-gold-soft" : status.tone === "bad" ? "text-bad" : "text-ink-faint"}`}
      >
        {status.tone === "bad" ? "✕ " : status.tone === "ok" ? "✓ " : ""}
        {status.text}
      </div>
    </div>
  );
}

/** Round whose deal animation already played (survives remounts, e.g. switching views). */
let introPlayedFor = -1;

export default function ArrangeBoard() {
  const hand = useGame((s) => s.hand)!;
  const draft = useGame((s) => s.draft);
  const { setDraft, confirm } = useGame.getState();
  const [intro, setIntro] = useState(() => introPlayedFor !== hand.roundNumber);
  const [dealing, setDealing] = useState(false);
  const endIntro = useCallback(() => {
    introPlayedFor = hand.roundNumber;
    setIntro(false);
    setDealing(true);
    setTimeout(() => setDealing(false), 1500);
  }, [hand.roundNumber]);
  const [dragging, setDragging] = useState<CardId | null>(null);
  const [foulOpen, setFoulOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // A drag starts as soon as a finger or mouse moves 4px — no long press needed on phones.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const initial = useMemo(() => dealtLayout(hand.dealtCards), [hand.dealtCards]);
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);

  const evalState = useMemo(() => {
    const cards = (ids: CardId[]) => ids.map(parseCard);
    return evaluatePartial({ front: cards(draft.front), middle: cards(draft.middle), back: cards(draft.back) });
  }, [draft]);
  const foulReasons = evalState.foulReasons;
  const isFoul = foulReasons.length > 0;

  const rowStatus = (row: Row): RowStatus => {
    const v = evalState[row];
    if (!v) return { text: "", tone: "dim" };
    const bad =
      (row === "front" && foulReasons.includes("FRONT_BEATS_MIDDLE")) ||
      (row === "middle" && isFoul) ||
      (row === "back" && foulReasons.includes("MIDDLE_BEATS_BACK"));
    return { text: describeHand(v), tone: bad ? "bad" : "ok" };
  };

  const onDragStart = (e: DragStartEvent) => {
    setDragging((e.active.data.current as { cardId: CardId }).cardId);
    tap();
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const a = (e.active.data.current as { cardId: CardId }).cardId;
    const b = (e.over?.data.current as { cardId: CardId } | undefined)?.cardId;
    if (!b || a === b) return;
    setDraft(swapCards(draft, a, b));
    tap(12);
    sound.play("place");
  };

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = () => {
    if (isFoul) setFoulOpen(true);
    else void run(() => confirm(false));
  };

  let dealIndex = 0;

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <TableShell center={<OpponentChips />}>
        <div className="absolute inset-x-2 bottom-2 top-11 flex flex-col items-center justify-center gap-1.5" style={ARRANGE_VARS}>
          {/* The three piles, centred on the table. */}
          {ROWS.map((row) => {
            const status = rowStatus(row);
            return (
              <div
                key={row}
                className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-1 ${status.tone === "bad" ? "bg-bad/10 ring-1 ring-bad/40" : "bg-black/20"}`}
              >
                <RowLabel row={row} status={status} />
                {/* Fixed width for 5 cards so all three rows line up, including the 3-card front row. */}
                <div className="flex gap-1.5" style={{ width: "calc(5 * var(--row-w) + 24px)" }}>
                  {intro
                    ? draft[row].map((id) => <div key={id} style={{ width: "var(--row-w)", height: "calc(var(--row-w) * 1.4)" }} />)
                    : draft[row].map((id) => <SwapCard key={id} id={id} dealIndex={dealing ? dealIndex++ : null} />)}
                </div>
              </div>
            );
          })}
          <p role="status" className={`text-center text-xs font-semibold ${isFoul ? "text-bad" : "text-good"}`}>
            {isFoul ? `✕ ${t.game.foul}: ${foulReasons.map((r) => t.game.foulReasons[r]).join(" · ")}` : `✓ ${t.game.valid}`}
            <span className="ml-2 font-normal text-ink-dim">· {t.game.swapHint}</span>
          </p>
        </div>

        {/* Bottom-right corner: Reset and Confirm, clear of the centred piles. */}
        <div className="absolute bottom-2 right-2 flex w-[128px] flex-col gap-1.5">
          <button
            type="button"
            className="chip min-h-[34px] justify-center text-xs"
            disabled={!changed}
            onClick={() => setDraft(initial)}
          >
            ↺ {t.game.reset}
          </button>
          <button
            type="button"
            className={`${isFoul ? "btn-danger" : "btn-primary"} min-h-[46px] w-full px-3 text-base`}
            disabled={busy}
            onClick={onConfirm}
          >
            {t.game.confirm}
          </button>
        </div>
      </TableShell>

      <AnimatePresence>{intro && <ShuffleIntro onDone={endIntro} />}</AnimatePresence>

      <DragOverlay dropAnimation={{ duration: 160, easing: "ease-out" }}>
        {dragging ? (
          <PlayingCard id={dragging} width="calc(var(--row-w, 60px) * 1.12)" className="rotate-3 shadow-lift" style={{ cursor: "grabbing" } as CSSProperties} />
        ) : null}
      </DragOverlay>

      <Sheet open={foulOpen} onClose={() => setFoulOpen(false)} title={t.game.foulTitle}>
        <ul className="mb-3 list-inside list-disc text-bad">
          {foulReasons.map((r) => (
            <li key={r}>{t.game.foulReasons[r]}</li>
          ))}
        </ul>
        <p className="mb-5 text-ink-dim">{t.game.foulBody}</p>
        <div className="flex flex-col gap-2.5">
          <button type="button" className="btn-primary w-full" onClick={() => setFoulOpen(false)}>
            {t.game.goBack}
          </button>
          <button
            type="button"
            className="btn-danger w-full"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await confirm(true);
                setFoulOpen(false);
              })
            }
          >
            {t.game.acceptFoul}
          </button>
        </div>
      </Sheet>
    </DndContext>
  );
}
