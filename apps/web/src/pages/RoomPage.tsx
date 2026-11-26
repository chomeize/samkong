import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConnectionBanner, Sheet } from "../components/ui";
import { Leaderboard, leaderboardFromRoom } from "../components/Leaderboard";
import { Countdown } from "../components/Countdown";
import { ReactionFeed, ReactionPicker } from "../components/Reactions";
import { RoomUIContext } from "../game/table/RoomUI";
import { sessionStore } from "../lib/session";
import { useGame } from "../store/game";
import { t } from "../i18n";
import Lobby from "../game/Lobby";
import ArrangeBoard from "../game/ArrangeBoard";
import WaitingView from "../game/WaitingView";
import RoundResultView from "../game/RoundResultView";
import FinalView from "../game/FinalView";
import SpectatorView from "../game/SpectatorView";

const iconBtn = "flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-lg active:scale-90";

function TopBar({ onLeave, onBoard, onReact }: { onLeave: () => void; onBoard: () => void; onReact: () => void }) {
  const room = useGame((s) => s.room)!;
  const soundOn = useGame((s) => s.soundOn);
  const toggleSound = useGame((s) => s.toggleSound);
  const inGame = room.gameState !== "LOBBY";
  const timing = room.deadlineAt !== null;
  return (
    <header
      className="safe-x sticky top-0 z-30 flex items-center gap-1.5 border-b border-white/10 bg-night/90 pb-2 backdrop-blur-md"
      style={{ paddingTop: "calc(0.5rem + var(--safe-top))" }}
    >
      <button type="button" onClick={onLeave} className={iconBtn} aria-label={t.room.leave}>
        ←
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
        <div className="max-w-full truncate font-display text-sm font-semibold">
          {inGame ? t.game.round(room.currentRound, room.settings.totalRounds) : room.roomName}
        </div>
        <div className="mt-0.5">
          {timing ? <Countdown /> : <span className="font-mono text-xs tracking-widest text-ink-dim">{room.roomCode}</span>}
        </div>
      </div>
      <button type="button" onClick={onReact} className={iconBtn} aria-label={t.social.open}>
        💬
      </button>
      <button type="button" onClick={toggleSound} className={iconBtn} aria-label={soundOn ? t.social.soundOn : t.social.soundOff} aria-pressed={soundOn}>
        {soundOn ? "🔊" : "🔇"}
      </button>
      {inGame && (
        <button type="button" onClick={onBoard} className={iconBtn} aria-label={t.board.title}>
          🏆
        </button>
      )}
    </header>
  );
}

export default function RoomPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const session = useGame((s) => s.session);
  const room = useGame((s) => s.room);
  const hand = useGame((s) => s.hand);
  const leaderboard = useGame((s) => s.leaderboard);
  const restore = useGame((s) => s.restore);
  const leave = useGame((s) => s.leave);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const hadSession = useRef(false);

  // Restore this tab's session after a refresh; otherwise go to the join form for this code.
  useEffect(() => {
    if (session && session.roomCode === code.toUpperCase()) {
      hadSession.current = true;
      return;
    }
    if (hadSession.current) {
      navigate("/", { replace: true }); // kicked, replaced or left
      return;
    }
    const tab = sessionStore.getTab();
    if (tab && tab.roomCode === code.toUpperCase()) {
      void restore(tab.sessionToken).then((ok) => {
        if (!ok) navigate(`/join/${code}`, { replace: true });
      });
    } else {
      navigate(`/join/${code}`, { replace: true });
    }
  }, [session, code, navigate, restore]);

  if (!session || !room) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-dim" role="status">
        {t.common.loading}
      </div>
    );
  }

  const state = room.gameState;
  // Lobby and the final screen are portrait pages; everything in between is the landscape table.
  const tableView = state !== "LOBBY" && state !== "GAME_FINISHED";
  let view: JSX.Element;
  if (state === "LOBBY") view = <Lobby />;
  else if (state === "ARRANGING" || state === "WAITING_FOR_CONFIRMATION" || state === "DEALING") {
    view = !hand ? <SpectatorView /> : hand.isConfirmed ? <WaitingView /> : <ArrangeBoard />;
  } else if (state === "GAME_FINISHED") view = <FinalView />;
  else view = <RoundResultView />;
  const ui = {
    openLeave: () => setLeaveOpen(true),
    openBoard: () => setBoardOpen(true),
    openReact: () => setReactOpen(true),
  };

  const doLeave = async () => {
    try {
      await leave();
      navigate("/", { replace: true });
    } catch {
      /* toast shown */
    }
  };

  return (
    <RoomUIContext.Provider value={ui}>
      {tableView ? (
view
      ) : (
        <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
          <ConnectionBanner />
          <TopBar onLeave={ui.openLeave} onBoard={ui.openBoard} onReact={ui.openReact} />
          {view}
        </div>
      )}
      <ReactionFeed />
      <ReactionPicker open={reactOpen} onClose={() => setReactOpen(false)} />

      <Sheet open={leaveOpen} onClose={() => setLeaveOpen(false)} title={t.room.leaveTitle}>
        {state !== "LOBBY" && <p className="mb-5 text-ink-dim">{t.room.leaveBody}</p>}
        <div className="flex flex-col gap-2.5">
          <button type="button" className="btn-danger w-full" onClick={doLeave}>
            {t.room.leaveConfirm}
          </button>
          <button type="button" className="btn-secondary w-full" onClick={() => setLeaveOpen(false)}>
            {t.room.stay}
          </button>
        </div>
      </Sheet>

      <Sheet open={boardOpen} onClose={() => setBoardOpen(false)} title={t.board.title}>
        <Leaderboard entries={leaderboard.length ? leaderboard : leaderboardFromRoom(room)} meId={session.playerId} />
      </Sheet>
    </RoomUIContext.Provider>
  );
}
