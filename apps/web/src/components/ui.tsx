import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AVATARS, AVATAR_IDS, type AvatarId } from "@sam-kong/protocol";
import { useGame } from "../store/game";
import { t } from "../i18n";

export function Avatar({ id, size = 40, ring }: { id: AvatarId; size?: number; ring?: "gold" | "dim" | "none" }) {
  const ringCls = ring === "gold" ? "ring-2 ring-gold" : ring === "dim" ? "ring-1 ring-white/15" : "";
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.56 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-night-3 ${ringCls}`}
    >
      {AVATARS[id]}
    </span>
  );
}

export function AvatarPicker({ value, onChange }: { value: AvatarId; onChange: (a: AvatarId) => void }) {
  return (
    <div role="radiogroup" aria-label={t.form.avatar} className="grid grid-cols-6 gap-2">
      {AVATAR_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`flex aspect-square items-center justify-center rounded-2xl text-2xl transition active:scale-90 ${
            value === id ? "bg-gold/20 ring-2 ring-gold" : "bg-night-3 ring-1 ring-white/10"
          }`}
        >
          {AVATARS[id]}
        </button>
      ))}
    </div>
  );
}

/** Segmented control: large tap targets, one row. */
export function Segmented<T extends string | number | null>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-2xl bg-night-3 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`min-h-[40px] flex-1 rounded-xl px-1 text-sm font-semibold transition ${
            value === o.value ? "bg-gold text-night" : "text-ink-dim"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-[52px] items-center justify-between gap-4">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-ink-dim">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? "bg-gold" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "left-7" : "left-1"}`}
        />
      </button>
    </label>
  );
}

/** Bottom sheet dialog — the mobile-native modal. Closes on backdrop tap or Escape. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label={title}>
          <motion.button
            type="button"
            aria-label={t.common.close}
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="panel relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-b-none px-5 pt-3 sm:rounded-b-3xl"
            style={{ paddingBottom: "calc(1.25rem + var(--safe-bottom))" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />
            <h2 className="mb-4 font-display text-xl font-semibold">{title}</h2>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ top: "calc(0.75rem + var(--safe-top))" }}
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((x) => (
          <motion.button
            key={x.id}
            type="button"
            onClick={() => dismiss(x.id)}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-lift ${
              x.tone === "error" ? "bg-bad text-white" : x.tone === "success" ? "bg-good text-night" : "bg-paper text-night"
            }`}
          >
            {x.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ConnectionBanner() {
  const connected = useGame((s) => s.connected);
  if (connected) return null;
  return (
    <div className="bg-bad/90 py-1.5 text-center text-sm font-medium text-white" style={{ paddingTop: "calc(0.375rem + var(--safe-top))" }}>
      {t.room.reconnecting}
    </div>
  );
}

/** Mobile page frame: centred column, safe-area gutters, optional sticky bottom actions. */
export function Screen({ children, actions, top }: { children: ReactNode; actions?: ReactNode; top?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      {top}
      <main className="safe-x flex flex-1 flex-col gap-5 py-4">{children}</main>
      {actions && <div className="action-bar safe-x pt-3">{actions}</div>}
    </div>
  );
}

export function scoreText(n: number) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}
export function scoreClass(n: number) {
  return n > 0 ? "text-good" : n < 0 ? "text-bad" : "text-ink-dim";
}
