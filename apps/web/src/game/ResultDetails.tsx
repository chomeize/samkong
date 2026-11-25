/** Detailed per-player result cards: used in the seat detail sheet and on the final screen. */
import { useState } from "react";
import { motion } from "motion/react";
import { ROWS, type PairwiseResult, type RowOutcome } from "@sam-kong/engine";
import type { PublicPlayer, RevealedHand, RoundResult } from "@sam-kong/protocol";
import { PlayingCard } from "../components/PlayingCard";
import { Avatar, scoreClass, scoreText } from "../components/ui";
import { useGame } from "../store/game";
import { t } from "../i18n";

/** A pair result seen from `me`'s side. */
export function fromSide(p: PairwiseResult, me: string) {
  const flip = p.playerB === me;
  const k = flip ? -1 : 1;
  const rows = p.rows
    ? (Object.fromEntries(ROWS.map((r) => [r, (p.rows![r] * k) as RowOutcome])) as Record<(typeof ROWS)[number], RowOutcome>)
    : null;
  return {
    opponent: flip ? p.playerA : p.playerB,
    rows,
    total: p.total * k,
    meFoul: flip ? p.bFoul : p.aFoul,
    oppFoul: flip ? p.aFoul : p.bFoul,
    scooped: p.scoopedBy === null ? null : (p.scoopedBy === "A") !== flip ? "me" : "them",
  };
}

const OUTCOME = { 1: { label: t.result.win, cls: "bg-good/20 text-good" }, 0: { label: t.result.draw, cls: "bg-white/10 text-ink-dim" }, [-1]: { label: t.result.lose, cls: "bg-bad/20 text-bad" } } as const;

export function PlayerResult({
  hand,
  player,
  result,
  meId,
  index,
  players,
}: {
  hand: RevealedHand;
  player: PublicPlayer | undefined;
  result: RoundResult;
  meId: string;
  index: number;
  players: PublicPlayer[];
}) {
  const [open, setOpen] = useState(hand.playerId === meId);
  const score = result.scores[hand.playerId]!;
  const name = (id: string) => players.find((p) => p.playerId === id)?.displayName ?? "?";
  const pairs = result.pairwise.filter((p) => p.playerA === hand.playerId || p.playerB === hand.playerId).map((p) => fromSide(p, hand.playerId));
  const isMe = hand.playerId === meId;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.12 }}
      className={`rounded-3xl border p-3 ${isMe ? "border-gold/60 bg-gold/5" : "border-white/10 bg-night-2/80"}`}
    >
      <header className="mb-2 flex items-center gap-2.5">
        {player && <Avatar id={player.avatar} size={36} ring={isMe ? "gold" : "dim"} />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">
            {player?.displayName ?? "?"} {isMe && <span className="text-xs text-ink-dim">({t.lobby.you})</span>}
          </div>
          <div className="flex flex-wrap gap-1 text-[11px] font-semibold">
            {hand.isFoul && <span className="rounded-full bg-bad/20 px-2 py-0.5 text-bad">{t.result.foul}</span>}
            {score.scoops > 0 && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-gold">🔥 {t.result.scoop} ×{score.scoops}</span>}
            {hand.isAutoSubmitted && <span className="rounded-full bg-white/10 px-2 py-0.5 text-ink-dim">{t.result.auto}</span>}
          </div>
        </div>
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5 + index * 0.12, type: "spring", stiffness: 300, damping: 14 }}
          className={`font-display text-3xl font-bold tabular-nums ${scoreClass(score.total)}`}
          aria-label={`${t.result.roundScore} ${scoreText(score.total)}`}
        >
          {scoreText(score.total)}
        </motion.span>
      </header>

      <div className="felt flex flex-col gap-1.5 rounded-2xl p-2" style={{ ["--card-w" as string]: "min(40px, calc((100vw - 5rem) / 7))" }}>
        {ROWS.map((row, r) => (
          <div key={row} className="flex items-center gap-2">
            <div className="flex flex-1 gap-1" style={{ perspective: 600 }}>
              {hand.arrangement[row].map((id, i) => (
                <motion.div
                  key={id}
                  initial={{ rotateY: 180, opacity: 0.6 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ delay: index * 0.12 + r * 0.08 + i * 0.03, duration: 0.35 }}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <PlayingCard id={id} />
                </motion.div>
              ))}
            </div>
            <span className={`w-[38%] text-right text-[11px] leading-tight ${hand.isFoul ? "text-bad" : "text-gold-soft"}`}>
              {hand.rankings[row].name}
              {hand.royalty[row] > 0 && (
                <span className="ml-1 inline-block rounded-md bg-gold px-1 font-bold text-night" title={t.result.royaltyBonus}>
                  +{hand.royalty[row]}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => setOpen(!open)} className="mt-2 w-full py-2 text-sm font-medium text-ink-dim" aria-expanded={open}>
        {open ? t.result.hideBreakdown : t.result.breakdown} {open ? "▴" : "▾"}
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-white/10 pt-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              [t.result.base, score.base],
              [t.result.scoopBonus, score.scoop],
              [t.result.royaltyBonus, score.royalty],
              [t.result.foulPenalty, score.foul],
            ].map(([label, v]) => (
              <div key={label as string} className="flex justify-between">
                <dt className="text-ink-dim">{label}</dt>
                <dd className={`font-semibold tabular-nums ${scoreClass(v as number)}`}>{scoreText(v as number)}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col gap-1.5">
            {pairs.map((p) => (
              <li key={p.opponent} className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate">
                  {t.result.vs} {name(p.opponent)}
                </span>
                {p.rows ? (
                  ROWS.map((row) => (
                    <span key={row} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${OUTCOME[p.rows![row]].cls}`} title={t.game.rows[row]}>
                      {OUTCOME[p.rows![row]].label}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] font-semibold text-bad">
                    {p.meFoul && p.oppFoul ? `${t.result.foul}ทั้งคู่` : p.meFoul ? t.result.foul : `${name(p.opponent)} ${t.result.foul}`}
                  </span>
                )}
                {p.scooped === "me" && <span aria-label="Scoop">🔥</span>}
                <span className={`w-9 text-right font-bold tabular-nums ${scoreClass(p.total)}`}>{scoreText(p.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.article>
  );
}

export function ResultList({ result }: { result: RoundResult }) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.session)!.playerId;
  // Me first, then by round score.
  const ordered = [...result.hands].sort((a, b) =>
    a.playerId === me ? -1 : b.playerId === me ? 1 : result.scores[b.playerId]!.total - result.scores[a.playerId]!.total,
  );
  return (
    <div className="flex flex-col gap-3">
      {ordered.map((h, i) => (
        <PlayerResult
          key={h.playerId}
          hand={h}
          player={room.players.find((p) => p.playerId === h.playerId)}
          result={result}
          meId={me}
          index={i}
          players={room.players}
        />
      ))}
    </div>
  );
}
