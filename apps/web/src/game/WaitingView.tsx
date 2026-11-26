import { useState } from "react";
import { describeHand, evaluateArrangement, parseCard, ROWS } from "@sam-kong/engine";
import { motion } from "motion/react";
import { PlayingCard } from "../components/PlayingCard";
import { Avatar } from "../components/ui";
import { useSecondsLeft } from "../components/Countdown";
import { useGame } from "../store/game";
import { t } from "../i18n";
import { TableShell } from "./table/TableShell";
import { OpponentChips } from "./table/OpponentChips";
import { useIsPortrait } from "./table/useOrientation";
import { ARRANGE_VARS_PORTRAIT, LAYOUT_VARS, RowLabel } from "./ArrangeBoard";

const DONE = new Set(["CONFIRMED", "AUTO_SUBMITTED"]);

/**
 * After confirming: your locked piles, who we're still waiting for, and an Edit button
 * that reopens the piles while the round is still open (time left, not everyone in).
 */
export default function WaitingView() {
  const hand = useGame((s) => s.hand)!;
  const room = useGame((s) => s.room)!;
  const unconfirm = useGame((s) => s.unconfirm);
  const portrait = useIsPortrait();
  const secondsLeft = useSecondsLeft();
  const [busy, setBusy] = useState(false);

  const a = hand.arrangement;
  const ev = evaluateArrangement({
    front: a.front.map(parseCard),
    middle: a.middle.map(parseCard),
    back: a.back.map(parseCard),
  });
  const players = room.players.filter((p) => p.playerState !== "NOT_READY" && p.playerState !== "READY");
  const done = players.filter((p) => DONE.has(p.playerState)).length;
  const bad = (row: (typeof ROWS)[number]) =>
    (row === "front" && ev.foulReasons.includes("FRONT_BEATS_MIDDLE")) ||
    (row === "middle" && ev.isFoul) ||
    (row === "back" && ev.foulReasons.includes("MIDDLE_BEATS_BACK"));
  const canEdit = !hand.isAutoSubmitted && (secondsLeft === null || secondsLeft > 1);

  const edit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await unconfirm();
    } catch {
      /* toast shown (e.g. everyone confirmed just now) */
    } finally {
      setBusy(false);
    }
  };

  const piles = (
    <motion.section
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex min-w-0 flex-col items-center justify-center gap-1.5"
    >
      {ROWS.map((row) => (
        <div
          key={row}
          className={`flex rounded-2xl bg-black/20 px-2.5 py-1 ${portrait ? "flex-col gap-1 pb-1.5" : "items-center gap-2.5"}`}
        >
          <RowLabel row={row} status={{ text: describeHand(ev[row]), tone: bad(row) ? "bad" : "ok" }} inline={portrait} />
          <div className={`flex gap-1.5 ${portrait ? "justify-center" : ""}`} style={{ width: "calc(5 * var(--row-w) + 24px)" }}>
            {a[row].map((id) => (
              <PlayingCard key={id} id={id} width="var(--row-w)" />
            ))}
          </div>
        </div>
      ))}
      {ev.isFoul && <p className="text-center text-xs font-semibold text-bad">✕ {t.game.foul}</p>}
    </motion.section>
  );

  const status = (
    <section className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/25 p-3 text-center" role="status">
      <span className="font-display text-base font-semibold text-good">✓ {t.game.waitingTitle}</span>
      <span className="text-sm text-ink-dim">{t.game.waitingOthers(done, players.length)}</span>
      <ul className="flex flex-wrap justify-center gap-2">
        {players.map((p) => (
          <li key={p.playerId} className="flex flex-col items-center gap-0.5">
            <span className={`rounded-full p-0.5 ${DONE.has(p.playerState) ? "bg-good" : "animate-pulse bg-white/20"}`}>
              <Avatar id={p.avatar} size={30} />
            </span>
            <span className="max-w-[4.5rem] truncate text-[11px]">{p.displayName}</span>
          </li>
        ))}
      </ul>
      {canEdit && (
        <>
          <button type="button" className="btn-secondary mt-1 min-h-[44px] w-full text-sm" disabled={busy} onClick={edit}>
            {t.game.edit}
          </button>
          <span className="text-[11px] text-ink-faint">{t.game.editHint}</span>
        </>
      )}
    </section>
  );

  return (
    <TableShell center={<OpponentChips />}>
      {portrait ? (
        <div className="absolute inset-x-3 bottom-2 top-1 flex flex-col items-center justify-center gap-3" style={ARRANGE_VARS_PORTRAIT}>
          {piles}
          <div className="w-full max-w-sm">{status}</div>
        </div>
      ) : (
        <div className="absolute inset-x-2 bottom-2 top-12 flex gap-3" style={LAYOUT_VARS}>
          <div className="flex min-w-0 flex-1 justify-center">{piles}</div>
          <div className="flex shrink-0 flex-col justify-center" style={{ width: "var(--panel-w)" }}>
            {status}
          </div>
        </div>
      )}
    </TableShell>
  );
}
