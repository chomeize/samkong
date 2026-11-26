import type { CSSProperties, ReactNode } from "react";
import { Countdown } from "../../components/Countdown";
import { useGame } from "../../store/game";
import { t } from "../../i18n";
import { useRoomUI } from "./RoomUI";
import { useIsPortrait } from "./useOrientation";

const iconBtn =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/35 text-base ring-1 ring-white/10 backdrop-blur active:scale-90";

/**
 * Full-screen landscape card table. Controls sit in the top corners so the top
 * seat and the middle of the table stay clear. Card sizes come from the screen
 * height (--opp-w for opponents, --me-w for you) so it fits a 375px-tall phone.
 */
export function TableShell({ children, center }: { children: ReactNode; center?: ReactNode }) {
  const room = useGame((s) => s.room)!;
  const connected = useGame((s) => s.connected);
  const soundOn = useGame((s) => s.soundOn);
  const toggleSound = useGame((s) => s.toggleSound);
  const ui = useRoomUI();
  const portrait = useIsPortrait();

  const left = (
    <div className="flex items-center gap-1.5">
      <button type="button" className={iconBtn} onClick={ui.openLeave} aria-label={t.room.leave}>
        ←
      </button>
      <span className="rounded-full bg-black/35 px-2.5 py-1 font-display text-xs font-semibold ring-1 ring-white/10">
        {t.game.round(room.currentRound, room.settings.totalRounds)}
      </span>
      {!connected && <span className="rounded-full bg-bad px-2 py-1 text-[11px] font-semibold text-white">{t.room.reconnecting}</span>}
    </div>
  );
  const right = (
    <div className="flex items-center gap-1.5">
      <Countdown />
      <button type="button" className={iconBtn} onClick={ui.openReact} aria-label={t.social.open}>
        💬
      </button>
      <button type="button" className={iconBtn} onClick={toggleSound} aria-label={soundOn ? t.social.soundOn : t.social.soundOff} aria-pressed={soundOn}>
        {soundOn ? "🔊" : "🔇"}
      </button>
      <button type="button" className={iconBtn} onClick={ui.openBoard} aria-label={t.board.title}>
        🏆
      </button>
    </div>
  );
  const vars = {
    // dvh = the height actually visible (iPhone Safari's toolbars excluded). A seat's three
    // stacked piles are ≈3× the card width tall, so top + bottom seats use ≈62% of the height.
    "--opp-w": "clamp(22px, 8.5dvh, 52px)",
    "--me-w": "clamp(26px, 12dvh, 68px)",
    paddingTop: "var(--safe-top)",
    paddingBottom: "var(--safe-bottom)",
    paddingLeft: "max(8px, var(--safe-left))",
    paddingRight: "max(8px, var(--safe-right))",
  } as CSSProperties;

  return (
    <div className="fixed inset-0 overflow-hidden bg-night select-none" style={vars}>
      {/* The table: felt with a dark rail, inset from the screen edge. */}
      <div
        aria-hidden
        className="absolute rounded-[clamp(28px,12vh,72px)] border-[6px] border-[#0c1a2c] shadow-[inset_0_0_60px_rgba(0,0,0,.45),0_0_0_1px_rgba(231,185,85,.25)]"
        style={{
          inset: "calc(var(--safe-top) + 4px) max(4px, var(--safe-right)) calc(var(--safe-bottom) + 4px) max(4px, var(--safe-left))",
          background: "radial-gradient(70% 80% at 50% 45%, #13775a 0%, #0d5c44 55%, #08402f 100%)",
        }}
      />
      {portrait ? (
        // Portrait: the bar sits above the table (controls on one line, opponents on the next);
        // the screen's content fills the space below it.
        <div className="relative flex h-full w-full flex-col">
          <header className="relative z-30 flex flex-col gap-1.5 px-1 pt-1.5">
            <div className="flex items-center justify-between gap-2">
              {left}
              {right}
            </div>
            {center && <div className="min-w-0">{center}</div>}
          </header>
          <div className="relative min-h-0 flex-1">{children}</div>
        </div>
      ) : (
        // Landscape: controls float in the top corners so the table keeps the full height.
        <div className="relative h-full w-full">
          <header className="pointer-events-none absolute inset-x-0 top-1 z-30 flex items-start justify-between gap-2 px-1">
            <div className="pointer-events-auto">{left}</div>
            {center && <div className="pointer-events-auto min-w-0 flex-1">{center}</div>}
            <div className="pointer-events-auto">{right}</div>
          </header>
          {children}
        </div>
      )}
    </div>
  );
}
