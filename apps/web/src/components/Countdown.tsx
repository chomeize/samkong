import { useEffect, useRef, useState } from "react";
import { useGame } from "../store/game";
import { sound } from "../lib/sound";
import { tap } from "../lib/haptics";
import { t } from "../i18n";

/** Seconds left until `deadlineAt` on the server clock, updated 4× a second. */
export function useSecondsLeft(): number | null {
  const deadlineAt = useGame((s) => s.room?.deadlineAt ?? null);
  const offset = useGame((s) => s.clockOffset);
  const [, force] = useState(0);
  useEffect(() => {
    if (!deadlineAt) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [deadlineAt]);
  if (!deadlineAt) return null;
  return Math.max(0, Math.ceil((deadlineAt - (Date.now() + offset)) / 1000));
}

/**
 * Countdown pill for the top bar. Warns at 30s and 10s (toast, vibration, sound),
 * ticks through the last 5 seconds, and saves the draft just before time runs out
 * so the server auto-submits what the player actually arranged.
 */
export function Countdown() {
  const left = useSecondsLeft();
  const hand = useGame((s) => s.hand);
  const round = hand?.roundNumber ?? 0;
  const arranging = !!hand && !hand.isConfirmed;
  const fired = useRef(new Set<string>());

  useEffect(() => {
    if (left === null || !arranging) return;
    const once = (key: string, fn: () => void) => {
      const k = `${round}:${key}`;
      if (!fired.current.has(k)) {
        fired.current.add(k);
        fn();
      }
    };
    if (left <= 30 && left > 10) once("30", () => {
      useGame.getState().toast(t.game.time30);
      sound.play("warn");
      tap(30);
    });
    if (left <= 10 && left > 0) once("10", () => {
      useGame.getState().toast(t.game.time10, "error");
      sound.play("warn");
      tap(60);
    });
    if (left <= 5 && left > 0) once(`tick${left}`, () => sound.play("tick"));
    if (left <= 2) once("flush", () => useGame.getState().flushDraft());
  }, [left, arranging, round]);

  if (left === null) return null;
  const tone = left <= 10 ? "bg-bad text-white animate-pulse" : left <= 30 ? "bg-gold text-night" : "bg-white/10 text-ink";
  return (
    <span
      role="timer"
      aria-live={left <= 10 ? "assertive" : "off"}
      aria-label={`เหลือเวลา ${left} วินาที`}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-sm font-semibold tabular-nums ${tone}`}
    >
      ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
  );
}
