import { useEffect, useState } from "react";
import { useGame } from "../store/game";

/**
 * Shown outside a room when the server hasn't answered for a couple of seconds
 * (server restarting after a deploy, or the player's connection dropped).
 */
export function ServerWakeBanner() {
  const connected = useGame((s) => s.connected);
  const inRoom = useGame((s) => !!s.room);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (connected) {
      setShow(false);
      return;
    }
    const id = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(id);
  }, [connected]);
  if (!show || inRoom) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[55] flex items-center justify-center gap-2 bg-gold px-4 pb-2 text-center text-sm font-semibold text-night shadow-lift"
      style={{ paddingTop: "calc(0.5rem + var(--safe-top))" }}
    >
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-night border-t-transparent" aria-hidden />
      กำลังเชื่อมต่อเซิร์ฟเวอร์…
    </div>
  );
}
