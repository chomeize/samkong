import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { CATEGORY_NAMES, ROWS, type Row } from "@sam-kong/engine";
import type { PublicPlayer, RevealedHand, RoundResult } from "@sam-kong/protocol";
import { PlayingCard } from "../components/PlayingCard";
import { ScoopBurst } from "../components/Celebration";
import { Avatar, Sheet, scoreClass, scoreText } from "../components/ui";
import { AvatarReaction } from "../components/Reactions";
import { sound } from "../lib/sound";
import { useGame } from "../store/game";
import { t } from "../i18n";
import { TableShell } from "./table/TableShell";
import { PlayerResult, fromSide } from "./ResultDetails";

type SeatPos = "me" | "left" | "top" | "right";
/** Stage 0–2 reveals front, middle, back in turn; 3 is the summary with everything face up. */
type Stage = -1 | 0 | 1 | 2 | 3;
const SUMMARY: Stage = 3;
const STAGE_MS = 1800;

/** Seats go clockwise from you (bottom): left, top, right. */
const LAYOUT: Record<number, SeatPos[]> = { 1: ["top"], 2: ["left", "right"], 3: ["left", "top", "right"] };

/** Round whose reveal already played; revisiting the result skips straight to the summary. */
let revealPlayedFor = -1;

/** A player's points for one pile: +1 / −1 per opponent compared on that pile. */
function rowPoints(result: RoundResult, playerId: string, row: Row): number {
  let sum = 0;
  for (const p of result.pairwise) {
    if (p.playerA !== playerId && p.playerB !== playerId) continue;
    const side = fromSide(p, playerId);
    if (side.rows) sum += side.rows[row];
  }
  return sum;
}

const rowIndex = (row: Row) => ROWS.indexOf(row);

/**
 * Three piles stacked like a fanned hand on the table: front on top, back closest.
 * Piles not yet revealed stay face down; the pile being compared is lifted and labelled.
 */
function Piles({
  hand,
  width,
  stage,
  label,
  bannerBelow,
}: {
  hand: RevealedHand;
  width: string;
  stage: Stage;
  label: (row: Row) => ReactNode;
  /** The top seat has no room above it, so its ribbon goes under the pile. */
  bannerBelow?: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center" style={{ ["--w" as string]: width }}>
      {ROWS.map((row, r) => {
        const faceUp = stage >= r;
        const active = stage === r;
        return (
          <div
            key={row}
            className="relative flex justify-center transition-transform duration-300"
            style={{
              marginTop: r === 0 ? 0 : "calc(var(--w) * 1.4 * -0.42)",
              zIndex: active ? 20 : r + 1,
              transform: active ? "translateY(-6px) scale(1.08)" : undefined,
              filter: stage >= 0 && stage < SUMMARY && !active && faceUp ? "brightness(.75)" : undefined,
            }}
          >
            {hand.arrangement[row].map((id, i) => (
              <motion.div
                key={`${id}-${faceUp}`}
                initial={faceUp && stage !== SUMMARY ? { rotateY: 90 } : false}
                animate={{ rotateY: 0 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
                style={{ marginLeft: i === 0 ? 0 : "calc(var(--w) * -0.52)" }}
              >
                <PlayingCard id={id} width="var(--w)" faceDown={!faceUp} className={active ? "shadow-glow" : ""} />
              </motion.div>
            ))}
            {active && (
              <div className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 ${bannerBelow ? "-bottom-3" : "-top-3"}`}>
                {label(row)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Gold ribbon for a pile in play: hand type and the points it earned. */
function Banner({ text, points, foul }: { text: string; points: number; foul: boolean }) {
  const good = !foul && points > 0;
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, y: 6 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 font-display text-[11px] font-bold shadow-lift ${
        foul ? "bg-bad text-white" : good ? "bg-gradient-to-r from-gold-deep via-gold to-gold-soft text-night" : "bg-night/90 text-ink ring-1 ring-white/20"
      }`}
    >
      {foul ? t.result.foul : text}
      {!foul && <span className="ml-1.5 tabular-nums">{scoreText(points)}</span>}
    </motion.div>
  );
}

function Seat({
  pos,
  player,
  hand,
  result,
  stage,
  onOpen,
}: {
  pos: SeatPos;
  player: PublicPlayer | undefined;
  hand: RevealedHand;
  result: RoundResult;
  stage: Stage;
  onOpen: () => void;
}) {
  const score = result.scores[hand.playerId]!;
  const isMe = pos === "me";
  const label = (row: Row) => (
    <Banner
      text={hand.rankings[row].isRoyal ? "Royal Flush" : CATEGORY_NAMES[hand.rankings[row].category as keyof typeof CATEGORY_NAMES]}
      points={rowPoints(result, hand.playerId, row)}
      foul={hand.isFoul}
    />
  );
  const summary = stage === SUMMARY;

  const identity = (
    <button type="button" onClick={onOpen} className="flex items-center gap-1.5 rounded-full bg-black/35 py-0.5 pl-0.5 pr-2 ring-1 ring-white/10 active:scale-95" aria-label={`${player?.displayName ?? ""} ${t.result.breakdown}`}>
      <span className="relative">
        {player && <Avatar id={player.avatar} size={isMe ? 30 : 28} ring={player.isHost ? "gold" : "none"} />}
        <AvatarReaction playerId={hand.playerId} />
      </span>
      <span className="min-w-0 text-left leading-tight">
        <span className="block max-w-[5.5rem] truncate text-[11px] font-semibold">{player?.displayName ?? "?"}</span>
        <span className="flex gap-1 text-[10px] font-bold">
          {hand.isFoul && <span className="text-bad">{t.result.foul}</span>}
          {score.scoops > 0 && <span className="text-gold">🔥×{score.scoops}</span>}
          {hand.isAutoSubmitted && <span className="text-ink-dim">⚙</span>}
        </span>
      </span>
    </button>
  );

  const totalChip = summary && !isMe && (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 14 }}
      className="rounded-xl bg-black/45 px-2 py-1 text-center ring-1 ring-white/10"
    >
      <div className="text-[10px] text-ink-dim">{t.result.total}</div>
      <div className={`font-display text-base font-bold leading-none tabular-nums ${scoreClass(score.total)}`}>{scoreText(score.total)}</div>
    </motion.div>
  );

  const piles = (
    <Piles hand={hand} width={isMe ? "var(--me-w)" : "var(--opp-w)"} stage={stage} label={label} bannerBelow={pos === "top"} />
  );

  // Name and total sit beside the piles (toward the middle of the table), so every seat
  // is only as tall as its piles and nothing overlaps on a short landscape screen.
  const place: Record<SeatPos, string> = {
    top: "left-1/2 top-2.5 -translate-x-1/2 flex-row items-center gap-2",
    left: "left-1 top-[44%] -translate-y-1/2 flex-row items-center gap-2",
    right: "right-1 top-[44%] -translate-y-1/2 flex-row-reverse items-center gap-2",
    me: "bottom-1 left-1/2 -translate-x-1/2 flex-row items-end gap-2",
  };

  return (
    <div className={`absolute flex ${place[pos]}`}>
      {pos === "left" || pos === "right" ? piles : null}
      <div className="flex flex-col items-center gap-1">
        {identity}
        {totalChip}
      </div>
      {pos === "top" || pos === "me" ? piles : null}
    </div>
  );
}

/** Your running score card, filled in pile by pile as the reveal plays. */
function ScorePanel({ result, meId, stage }: { result: RoundResult; meId: string; stage: Stage }) {
  const score = result.scores[meId];
  if (!score) return null;
  const lines: Array<{ label: string; value: number; show: boolean; tone?: string }> = [
    ...ROWS.map((row, r) => ({ label: t.game.rows[row], value: rowPoints(result, meId, row), show: stage >= r })),
    { label: t.result.scoop, value: score.scoop, show: stage === SUMMARY && score.scoop !== 0, tone: "text-gold" },
    { label: "Royalty", value: score.royalty, show: stage === SUMMARY && score.royalty !== 0, tone: "text-gold" },
    { label: t.result.foulPenalty, value: score.foul, show: stage === SUMMARY && score.foul !== 0, tone: "text-bad" },
  ];
  return (
    <div className="absolute bottom-1 right-1 w-[min(132px,20vw)] rounded-xl bg-night/85 px-2 py-1.5 text-[11px] shadow-lift ring-1 ring-gold/30 backdrop-blur" aria-live="polite">
      {lines.filter((l, i) => i < ROWS.length || l.show).map((l) => (
        <div key={l.label} className="flex justify-between leading-[1.45]">
          <span className={l.tone ?? "text-ink-dim"}>{l.label}:</span>
          <span className={`font-bold tabular-nums ${l.show ? scoreClass(l.value) : "text-ink-faint"}`}>{l.show ? scoreText(l.value) : "·"}</span>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between border-t border-white/10 pt-1">
        <span className="font-semibold">{t.result.total}:</span>
        <span className={`font-display text-base font-bold tabular-nums ${stage === SUMMARY ? scoreClass(score.total) : "text-ink-faint"}`}>
          {stage === SUMMARY ? scoreText(score.total) : "·"}
        </span>
      </div>
    </div>
  );
}

export default function RoundResultView() {
  const room = useGame((s) => s.room)!;
  const session = useGame((s) => s.session)!;
  const result = useGame((s) => s.result);
  const { nextRound, endGame } = useGame.getState();
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const isHost = room.hostPlayerId === session.playerId;
  const round = result?.roundNumber ?? -1;
  const [stage, setStage] = useState<Stage>(() => (revealPlayedFor === round ? SUMMARY : -1));

  // Play the reveal: a beat with cards face down, then each pile in turn, then the summary.
  useEffect(() => {
    if (!result || stage === SUMMARY) return;
    const id = setTimeout(() => setStage((s) => (s + 1) as Stage), stage === -1 ? 600 : STAGE_MS);
    return () => clearTimeout(id);
  }, [stage, result]);

  const me = result?.scores[session.playerId];
  useEffect(() => {
    if (stage >= 0 && stage < SUMMARY) sound.play("flip");
    if (stage === SUMMARY && revealPlayedFor !== round) {
      revealPlayedFor = round;
      if (me) sound.play(me.scoops > 0 ? "scoop" : me.total > 0 ? "win" : me.total < 0 ? "lose" : "confirm");
    }
  }, [stage, round, me]);

  const seats = useMemo(() => {
    if (!result) return [];
    const ids = result.hands.map((h) => h.playerId);
    const myIdx = ids.indexOf(session.playerId);
    const others = myIdx < 0 ? ids : [...ids.slice(myIdx + 1), ...ids.slice(0, myIdx)];
    const layout = LAYOUT[others.length] ?? LAYOUT[3]!;
    return [
      ...(myIdx >= 0 ? [{ id: session.playerId, pos: "me" as SeatPos }] : []),
      ...others.map((id, i) => ({ id, pos: layout[i]! })),
    ];
  }, [result, session.playerId]);

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

  if (!result) {
    return (
      <TableShell>
        <div className="flex h-full items-center justify-center text-ink-dim">{t.common.loading}</div>
      </TableShell>
    );
  }

  const detailHand = detail ? result.hands.find((h) => h.playerId === detail) : undefined;

  return (
    <TableShell>
      {stage === SUMMARY && (me?.scoops ?? 0) > 0 && revealPlayedFor === round && <ScoopOnce round={round} count={me!.scoops} />}

      {seats.map(({ id, pos }) => (
        <Seat
          key={id}
          pos={pos}
          player={room.players.find((p) => p.playerId === id)}
          hand={result.hands.find((h) => h.playerId === id)!}
          result={result}
          stage={stage}
          onOpen={() => setDetail(id)}
        />
      ))}

      <ScorePanel result={result} meId={session.playerId} stage={stage} />

      {/* Bottom-left: skip during the reveal; host controls afterwards. */}
      <div className="absolute bottom-1 left-1 flex w-[min(170px,24vw)] flex-col gap-1.5">
        {stage < SUMMARY ? (
          <button type="button" className="chip min-h-[38px] justify-center" onClick={() => setStage(SUMMARY)}>
            ⏭ {t.result.skip}
          </button>
        ) : isHost ? (
          <>
            <button type="button" className="btn-primary min-h-[42px] text-sm" disabled={busy} onClick={() => run(nextRound)}>
              {t.result.nextRound} →
            </button>
            <button type="button" className="btn-secondary min-h-[36px] text-sm" disabled={busy} onClick={() => run(endGame)}>
              {t.result.endGame}
            </button>
          </>
        ) : (
          <p className="rounded-xl bg-black/40 px-2 py-1.5 text-center text-xs text-ink-dim">{t.result.waitHost}</p>
        )}
      </div>

      <Sheet open={!!detailHand} onClose={() => setDetail(null)} title={t.result.breakdown}>
        {detailHand && (
          <PlayerResult
            hand={detailHand}
            player={room.players.find((p) => p.playerId === detailHand.playerId)}
            result={result}
            meId={session.playerId}
            index={0}
            players={room.players}
          />
        )}
      </Sheet>
    </TableShell>
  );
}

/** Scoop celebration, once per round. */
let scoopShownFor = -1;
function ScoopOnce({ round, count }: { round: number; count: number }) {
  const [show] = useState(() => {
    if (scoopShownFor === round) return false;
    scoopShownFor = round;
    return true;
  });
  return show ? <ScoopBurst count={count} /> : null;
}
