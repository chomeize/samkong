import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { PlayingCard } from "../components/PlayingCard";
import { Screen, Sheet } from "../components/ui";
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

/** Sheet where the site owner enters their key once; the device remembers it. */
function OwnerKeySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ownerKey = useGame((s) => s.ownerKey);
  const { saveOwnerKey, forgetOwnerKey, toast } = useGame.getState();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await saveOwnerKey(value);
      toast(t.access.ownerSaved, "success");
      setValue("");
      onClose();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t.access.ownerTitle}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-ink-dim">{t.access.ownerBody}</p>
        <input
          className="field font-mono"
          type="password"
          autoComplete="current-password"
          placeholder={t.access.ownerPlaceholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={t.access.ownerPlaceholder}
        />
        <button type="submit" className="btn-primary w-full" disabled={!value.trim() || busy}>
          {t.access.ownerSave}
        </button>
        {ownerKey && (
          <button
            type="button"
            className="btn-ghost w-full text-sm"
            onClick={() => {
              forgetOwnerKey();
              onClose();
            }}
          >
            {t.access.ownerForget}
          </button>
        )}
      </form>
    </Sheet>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const restore = useGame((s) => s.restore);
  const serverInfo = useGame((s) => s.serverInfo);
  const ownerKey = useGame((s) => s.ownerKey);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const last = sessionStore.getLast();
  // Show "Create room" only when anyone may create, or on the owner's own device.
  const canCreate = serverInfo !== null && (!serverInfo.ownerKeyRequired || !!ownerKey);

  const resume = async () => {
    if (!last) return;
    if (await restore(last.sessionToken)) navigate(`/room/${last.roomCode}`);
    else useGame.getState().toast(t.room.sessionLost, "error");
  };

  return (
    <Screen
      actions={
        <div className="flex flex-col gap-2.5">
          {canCreate && (
            <Link to="/create" className="btn-primary w-full text-lg">
              {t.home.create}
            </Link>
          )}
          <Link to="/join" className={`${canCreate ? "btn-secondary" : "btn-primary text-lg"} w-full`}>
            {t.home.join}
          </Link>
          {canCreate && (
            <Link to="/bots" className="btn-ghost min-h-[44px] w-full border border-white/10">
              {t.bots.homeButton}
            </Link>
          )}
          {serverInfo?.ownerKeyRequired && (
            <button type="button" className="btn-ghost min-h-[36px] text-xs" onClick={() => setOwnerOpen(true)}>
              🔑 {t.access.ownerLink}
            </button>
          )}
        </div>
      }
    >
      <OwnerKeySheet open={ownerOpen} onClose={() => setOwnerOpen(false)} />
      <div className="flex flex-1 flex-col justify-center gap-6 pt-6 text-center">
        <Logo />
        <div>
          <h1 className="font-display text-5xl font-bold tracking-tight text-gold">{t.appName}</h1>
          <p className="mt-2 font-display text-lg text-ink">{t.tagline}</p>
        </div>
        <p className="mx-auto max-w-sm text-ink-dim">{t.home.intro}</p>
        {serverInfo?.ownerKeyRequired && !ownerKey && (
          <p className="mx-auto max-w-sm rounded-2xl bg-white/5 px-4 py-3 text-sm text-ink-dim">{t.access.ownerOnly}</p>
        )}
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
