import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { PlayingCard } from "../components/PlayingCard";
import { Screen } from "../components/ui";
import { sessionStore } from "../lib/session";
import { useGame } from "../store/game";
import { t } from "../i18n";

/** Three fanned cards: the game's mark. */
function Logo() {
  const cards = ["AS", "KH", "QD"];
  return (
    <div className="relative mx-auto h-32 w-48" aria-hidden>
      {cards.map((id, i) => (
        <motion.div
          key={id}
          className="absolute left-1/2 top-2"
          initial={{ rotate: 0, x: "-50%", opacity: 0, y: 20 }}
          animate={{ rotate: (i - 1) * 16, x: `calc(-50% + ${(i - 1) * 34}px)`, opacity: 1, y: Math.abs(i - 1) * 8 }}
          transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 220, damping: 18 }}
          style={{ transformOrigin: "50% 120%" }}
        >
          <PlayingCard id={id} width={64} className={i === 1 ? "ring-2 ring-gold" : ""} />
        </motion.div>
      ))}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const restore = useGame((s) => s.restore);
  const last = sessionStore.getLast();

  const resume = async () => {
    if (!last) return;
    if (await restore(last.sessionToken)) navigate(`/room/${last.roomCode}`);
    else useGame.getState().toast(t.room.sessionLost, "error");
  };

  return (
    <Screen
      actions={
        <div className="flex flex-col gap-2.5">
          <Link to="/create" className="btn-primary w-full text-lg">
            {t.home.create}
          </Link>
          <Link to="/join" className="btn-secondary w-full">
            {t.home.join}
          </Link>
        </div>
      }
    >
      <div className="flex flex-1 flex-col justify-center gap-6 pt-6 text-center">
        <Logo />
        <div>
          <h1 className="font-display text-5xl font-bold tracking-tight text-gold">{t.appName}</h1>
          <p className="mt-2 font-display text-lg text-ink">{t.tagline}</p>
        </div>
        <p className="mx-auto max-w-sm text-ink-dim">{t.home.intro}</p>
        {last && (
          <button type="button" onClick={resume} className="panel mx-auto flex w-full max-w-sm items-center justify-between px-5 py-4 text-left">
            <span>
              <span className="block font-semibold">{t.home.resume}</span>
              <span className="font-mono text-sm text-ink-dim">{t.home.resumeHint(last.roomCode)}</span>
            </span>
            <span aria-hidden className="text-2xl text-gold">→</span>
          </button>
        )}
        <Link to="/how-to-play" className="btn-ghost mx-auto underline-offset-4 hover:underline">
          {t.home.howTo}
        </Link>
      </div>
    </Screen>
  );
}
