import { describeHand, evaluateArrangement, parseCard, ROWS } from "@sam-kong/engine";
import { motion } from "motion/react";
import { PlayingCard } from "../components/PlayingCard";
import { Avatar } from "../components/ui";
import { useGame } from "../store/game";
import { t } from "../i18n";
import { TableShell } from "./table/TableShell";
import { OpponentChips } from "./table/OpponentChips";
import { LAYOUT_VARS, RowLabel } from "./ArrangeBoard";

const DONE = new Set(["CONFIRMED", "AUTO_SUBMITTED"]);

/** After confirming: your locked piles on the left, who we're still waiting for on the right. */
export default function WaitingView() {
  const hand = useGame((s) => s.hand)!;
  const room = useGame((s) => s.room)!;
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

  return (
    <TableShell center={<OpponentChips />}>
      <div className="absolute inset-x-2 bottom-2 top-12 flex gap-3" style={LAYOUT_VARS}>
        <motion.section
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex min-w-0 flex-1 flex-col justify-center gap-1.5"
        >
          {ROWS.map((row) => (
            <div key={row} className="flex items-center gap-2.5 rounded-2xl bg-black/20 px-2.5 py-1.5">
              <RowLabel row={row} count={a[row].length} status={{ text: describeHand(ev[row]), tone: bad(row) ? "bad" : "ok" }} />
              <div className="flex gap-1.5">
                {a[row].map((id) => (
                  <PlayingCard key={id} id={id} width="var(--row-w)" />
                ))}
              </div>
            </div>
          ))}
          {ev.isFoul && <p className="text-center text-xs font-semibold text-bad">✕ {t.game.foul}</p>}
        </motion.section>

        <section
          className="flex shrink-0 flex-col items-center justify-center gap-3 rounded-2xl bg-black/25 p-4 text-center"
          style={{ width: "var(--panel-w)" }}
          role="status"
        >
          <span className="font-display text-lg font-semibold text-good">✓ {t.game.waitingTitle}</span>
          <span className="text-sm text-ink-dim">{t.game.waitingOthers(done, players.length)}</span>
          <ul className="flex flex-wrap justify-center gap-2">
            {players.map((p) => (
              <li key={p.playerId} className="flex flex-col items-center gap-1">
                <span className={`rounded-full p-0.5 ${DONE.has(p.playerState) ? "bg-good" : "animate-pulse bg-white/20"}`}>
                  <Avatar id={p.avatar} size={36} />
                </span>
                <span className="max-w-[4.5rem] truncate text-[11px]">{p.displayName}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </TableShell>
  );
}
