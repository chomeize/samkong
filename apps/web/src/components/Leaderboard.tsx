import type { LeaderboardEntry, PublicRoom } from "@sam-kong/protocol";
import { Avatar, scoreClass, scoreText } from "./ui";
import { t } from "../i18n";

/** Build a leaderboard from the room when the server hasn't sent one yet (e.g. after a refresh). */
export function leaderboardFromRoom(room: PublicRoom): LeaderboardEntry[] {
  const sorted = [...room.players].sort((a, b) => b.totalScore - a.totalScore || a.joinOrder - b.joinOrder);
  return sorted.map((p) => ({
    rank: sorted.findIndex((q) => q.totalScore === p.totalScore) + 1,
    tied: sorted.filter((q) => q.totalScore === p.totalScore).length > 1,
    playerId: p.playerId,
    displayName: p.displayName,
    avatar: p.avatar,
    currentRoundScore: p.currentRoundScore,
    totalScore: p.totalScore,
    scoopCount: p.scoopCount,
    foulCount: p.foulCount,
  }));
}

const MEDAL = ["🥇", "🥈", "🥉"];

export function Leaderboard({ entries, meId }: { entries: LeaderboardEntry[]; meId?: string }) {
  return (
    <ol className="flex flex-col gap-2" aria-label={t.board.title}>
      {entries.map((e) => (
        <li
          key={e.playerId}
          className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${e.playerId === meId ? "bg-gold/10 ring-1 ring-gold/50" : "bg-white/5"}`}
        >
          <span className="w-8 text-center font-display text-lg font-bold tabular-nums">
            {MEDAL[e.rank - 1] ?? e.rank}
            {e.tied && <span className="sr-only">(อันดับร่วม)</span>}
          </span>
          <Avatar id={e.avatar} size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{e.displayName}</span>
            <span className="text-xs text-ink-dim">
              {t.board.scoops} {e.scoopCount} · {t.board.fouls} {e.foulCount}
              {e.tied ? " · อันดับร่วม" : ""}
            </span>
          </span>
          <span className="text-right">
            <span className={`block font-display text-xl font-bold tabular-nums ${scoreClass(e.totalScore)}`}>
              {scoreText(e.totalScore)}
            </span>
            <span className={`text-xs tabular-nums ${scoreClass(e.currentRoundScore)}`}>
              {t.board.thisRound} {scoreText(e.currentRoundScore)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
