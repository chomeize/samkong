import { useEffect, useState } from "react";

const QUERY = "(orientation: portrait)";

/** True while the screen is taller than wide (a phone held upright, or a narrow window). */
export function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setPortrait(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return portrait;
}
