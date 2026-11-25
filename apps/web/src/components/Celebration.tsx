import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PlayingCard } from "./PlayingCard";

const CONFETTI_COLORS = ["#e7b955", "#f3d58e", "#4ade80", "#fbfaf6", "#d1382f"];

/** One-shot confetti burst; skipped entirely when the phone asks for reduced motion. */
export function Confetti({ count = 36 }: { count?: number }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.6,
        rotate: Math.random() * 720 - 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: 6 + Math.random() * 6,
        dur: 2.2 + Math.random(),
      })),
    [count],
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 rounded-sm"
          style={{ left: `${p.x}%`, width: p.w, height: p.w * 1.6, background: p.color }}
          initial={{ y: -40, rotate: 0, opacity: 1 }}
          animate={{ y: "105vh", rotate: p.rotate, opacity: [1, 1, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}

/** Big "SCOOP!" stamp with confetti, shown once when you win all three piles against someone. */
export function ScoopBurst({ count }: { count: number }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(id);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <>
          <Confetti count={28} />
          <motion.div
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-live="polite"
          >
            <motion.div
              initial={{ scale: 2.4, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: -6, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.6 }}
              className="rounded-3xl border-4 border-gold bg-night/85 px-6 py-3 text-center shadow-lift"
            >
              <div className="font-display text-5xl font-bold text-gold">🔥 SCOOP!</div>
              {count > 1 && <div className="font-display text-lg text-gold-soft">×{count}</div>}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Shuffle-then-deal intro at the start of a round: a deck riffles for a moment,
 * then the screen reveals the hand (whose cards fly in on their own).
 */
export function ShuffleIntro({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const id = setTimeout(onDone, reduce ? 0 : 900);
    return () => clearTimeout(id);
  }, [onDone, reduce]);
  if (reduce) return null;
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-night/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      aria-hidden
    >
      <div className="relative h-28 w-20">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0"
            animate={{ x: [0, i % 2 ? 34 : -34, 0], rotate: [0, i % 2 ? 8 : -8, 0], y: [0, -i * 2, 0] }}
            transition={{ duration: 0.42, repeat: 1, delay: i * 0.05, ease: "easeInOut" }}
          >
            <PlayingCard id="AS" faceDown width={80} />
          </motion.div>
        ))}
      </div>
      <p className="font-display text-lg font-semibold text-gold">กำลังสับไพ่…</p>
    </motion.div>
  );
}
