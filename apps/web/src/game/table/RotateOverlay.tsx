import { useEffect, useState } from "react";
import { motion } from "motion/react";

/** Phones held upright get a prompt to turn sideways; desktops and landscape phones never see it. */
const QUERY = "(orientation: portrait) and (pointer: coarse)";

function usePortraitPhone() {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return match;
}

/** Android Chrome can go fullscreen and lock landscape from a tap; iOS can't, so we only explain there. */
const canLock = () =>
  typeof document !== "undefined" &&
  !!document.documentElement.requestFullscreen &&
  !!(screen.orientation as ScreenOrientation & { lock?: unknown }).lock;

async function goLandscape() {
  try {
    await document.documentElement.requestFullscreen();
    await (screen.orientation as ScreenOrientation & { lock(o: string): Promise<void> }).lock("landscape");
  } catch {
    /* not allowed here: the instructions still apply */
  }
}

export function RotateOverlay() {
  const portrait = usePortraitPhone();
  if (!portrait) return null;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-night px-8 text-center" role="dialog" aria-modal aria-label="หมุนจอ">
      <motion.div
        className="text-7xl"
        animate={{ rotate: [0, 0, 90, 90, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.2, 0.5, 0.8, 1] }}
        aria-hidden
      >
        📱
      </motion.div>
      <div>
        <h2 className="font-display text-2xl font-bold text-gold">หมุนมือถือเป็นแนวนอน</h2>
        <p className="mt-2 text-ink-dim">โต๊ะไพ่ออกแบบสำหรับจอแนวนอน ถ้าหมุนไม่ได้ ให้ปิดล็อกการหมุนจอก่อน</p>
      </div>
      {canLock() && (
        <button type="button" className="btn-primary" onClick={goLandscape}>
          ⤢ เต็มจอแนวนอน
        </button>
      )}
    </div>
  );
}
