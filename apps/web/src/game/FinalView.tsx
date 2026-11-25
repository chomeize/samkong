import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Avatar, Sheet } from "../components/ui";
import { Leaderboard, leaderboardFromRoom } from "../components/Leaderboard";
import { Confetti } from "../components/Celebration";
import { useGame } from "../store/game";
import { t } from "../i18n";
import { ResultList } from "./ResultDetails";

export default function FinalView() {
  const navigate = useNavigate();
  const room = useGame((s) => s.room)!;
  const session = useGame((s) => s.session)!;
  const finished = useGame((s) => s.finished);
  const result = useGame((s) => s.result);
  const { playAgain, backToLobby, leave } = useGame.getState();
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  const isHost = room.hostPlayerId === session.playerId;

  const board = finished?.leaderboard ?? leaderboardFromRoom(room);
  const winnerIds = finished?.winnerIds ?? board.filter((e) => e.rank === 1).map((e) => e.playerId);
  const winners = board.filter((e) => winnerIds.includes(e.playerId));
  const iWon = winnerIds.includes(session.playerId);

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

  return (
    <>
      {/* Everyone celebrates the winner; the winner gets a bigger burst. */}
      <Confetti count={iWon ? 60 : 24} />
      <main className="safe-x flex flex-1 flex-col gap-5 py-4">
        <section className="felt relative overflow-hidden rounded-3xl border border-gold/40 px-5 py-6 text-center shadow-lift">
          <p className="font-display text-sm font-semibold uppercase tracking-widest text-gold">{t.final.title}</p>
          <div className="mt-4 flex justify-center gap-4">
            {winners.map((w, i) => (
              <motion.div
                key={w.playerId}
                initial={{ scale: 0.3, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1, type: "spring", stiffness: 220, damping: 12 }}
                className="flex flex-col items-center"
              >
                <span className="text-3xl" aria-hidden>👑</span>
                <Avatar id={w.avatar} size={72} ring="gold" />
                <span className="mt-2 max-w-[8rem] truncate font-display text-xl font-bold">{w.displayName}</span>
                <span className="font-display text-lg font-bold text-good tabular-nums">+{w.totalScore}</span>
              </motion.div>
            ))}
          </div>
          <p className="mt-3 text-ink-dim">
            {winners.length > 1 ? t.final.winners : t.final.winner} · {t.final.rounds(finished?.roundsPlayed ?? room.currentRound)}
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-semibold">{t.board.title}</h2>
          <Leaderboard entries={board} meId={session.playerId} />
        </section>

        {result && (
          <button type="button" className="chip mx-auto" onClick={() => setLastOpen(true)}>
            {t.result.title(result.roundNumber)} ▸
          </button>
        )}
      </main>

      <div className="action-bar safe-x pt-3">
        {isHost ? (
          <div className="flex flex-col gap-2">
            <button type="button" className="btn-primary w-full text-lg" disabled={busy} onClick={() => run(playAgain)}>
              ↻ {t.final.playAgain}
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" disabled={busy} onClick={() => run(backToLobby)}>
                {t.final.backToLobby}
              </button>
              <button type="button" className="btn-ghost flex-1" disabled={busy} onClick={() => run(async () => { await leave(); navigate("/"); })}>
                {t.final.leave}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm text-ink-dim">{t.final.waitHost}</p>
            <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => run(async () => { await leave(); navigate("/"); })}>
              {t.final.leave}
            </button>
          </div>
        )}
      </div>

      {result && (
        <Sheet open={lastOpen} onClose={() => setLastOpen(false)} title={t.result.title(result.roundNumber)}>
          <ResultList result={result} />
        </Sheet>
      )}
    </>
  );
}
