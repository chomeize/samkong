import type { PublicPlayer } from "@sam-kong/protocol";
import { Avatar, scoreClass, scoreText } from "../../components/ui";
import { AvatarReaction } from "../../components/Reactions";
import { useGame } from "../../store/game";
import { t } from "../../i18n";

function statusIcon(p: PublicPlayer): { icon: string; label: string; cls: string } {
  if (p.hasLeft) return { icon: "⎋", label: t.lobby.left, cls: "bg-white/20" };
  if (p.playerState === "CONFIRMED") return { icon: "✓", label: t.game.confirmed, cls: "bg-good text-night" };
  if (p.playerState === "AUTO_SUBMITTED") return { icon: "⚙", label: t.game.autoSubmitted, cls: "bg-gold text-night" };
  if (p.connectionStatus === "OFFLINE") return { icon: "⏸", label: t.lobby.offline, cls: "bg-white/25" };
  return { icon: "…", label: t.game.arranging, cls: "bg-white/15 animate-pulse" };
}

/** Compact opponents for the top bar while arranging: avatar, status badge, score. */
export function OpponentChips() {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.session)!.playerId;
  const others = room.players.filter((p) => p.playerId !== me);
  return (
    <ul className="flex justify-center gap-1.5" aria-label="คู่แข่ง">
      {others.map((p) => {
        const s = statusIcon(p);
        return (
          <li key={p.playerId} className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/35 py-0.5 pl-0.5 pr-2.5 ring-1 ring-white/10">
            <span className="relative">
              <Avatar id={p.avatar} size={30} ring={p.isHost ? "gold" : "none"} />
              <span className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${s.cls}`} aria-label={s.label}>
                {s.icon}
              </span>
              <AvatarReaction playerId={p.playerId} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block max-w-[5.5rem] truncate text-[11px] font-semibold">{p.displayName}</span>
              <span className={`block text-[11px] font-bold tabular-nums ${scoreClass(p.totalScore)}`}>{scoreText(p.totalScore)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
