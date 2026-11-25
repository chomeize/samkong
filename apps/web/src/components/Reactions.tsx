import { AnimatePresence, motion } from "motion/react";
import { AVATARS, QUICK_MESSAGES, REACTION_EMOJIS, type QuickMessageId } from "@sam-kong/protocol";
import { useGame, type LiveReaction } from "../store/game";
import { Sheet } from "./ui";
import { tap } from "../lib/haptics";
import { t } from "../i18n";

export const reactionText = (r: Pick<LiveReaction, "kind" | "value">) =>
  r.kind === "emoji" ? r.value : QUICK_MESSAGES[r.value as QuickMessageId] ?? "";

/** Bottom sheet with big emoji buttons and quick messages; one tap sends and closes. */
export function ReactionPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const send = (kind: "emoji" | "quick", value: string) => {
    tap();
    onClose();
    useGame.getState().sendReaction(kind, value).catch(() => {});
  };
  return (
    <Sheet open={open} onClose={onClose} title={t.social.title}>
      <div className="grid grid-cols-4 gap-2">
        {REACTION_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => send("emoji", e)}
            className="flex aspect-square items-center justify-center rounded-2xl bg-white/5 text-4xl active:scale-90"
            aria-label={`ส่ง ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <h3 className="mb-2 mt-5 text-sm font-medium text-ink-dim">{t.social.quick}</h3>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(QUICK_MESSAGES) as QuickMessageId[]).map((id) => (
          <button key={id} type="button" onClick={() => send("quick", id)} className="chip min-h-[44px] px-4 text-base">
            {QUICK_MESSAGES[id]}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Speech bubble that pops above a player's avatar for a few seconds. */
export function AvatarReaction({ playerId }: { playerId: string }) {
  const latest = useGame((s) => [...s.reactions].reverse().find((r) => r.playerId === playerId));
  return (
    <AnimatePresence>
      {latest && (
        <motion.span
          key={latest.id}
          initial={{ opacity: 0, y: 6, scale: 0.5 }}
          animate={{ opacity: 1, y: -4, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 420, damping: 18 }}
          className={`pointer-events-none absolute bottom-full left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-paper px-2 py-0.5 font-semibold text-night shadow-lift ${
            latest.kind === "emoji" ? "text-2xl" : "text-xs"
          }`}
          aria-hidden
        >
          {reactionText(latest)}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Feed of recent reactions under the top bar, so they're seen on every screen (including your own). */
export function ReactionFeed() {
  const reactions = useGame((s) => s.reactions);
  const players = useGame((s) => s.room?.players ?? []);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 mx-auto flex max-w-lg flex-col items-end gap-1.5 px-4"
      style={{ top: "calc(3.25rem + var(--safe-top))" }}
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {reactions.map((r) => {
          const p = players.find((x) => x.playerId === r.playerId);
          return (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              className="flex items-center gap-1.5 rounded-full bg-night-3/95 py-1 pl-1 pr-3 shadow-lift ring-1 ring-white/10"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-base">{p ? AVATARS[p.avatar] : "🙂"}</span>
              <span className="max-w-[7rem] truncate text-xs text-ink-dim">{p?.displayName}</span>
              <span className={r.kind === "emoji" ? "text-xl" : "text-sm font-semibold"}>{reactionText(r)}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
