/**
 * Game sounds, synthesised with Web Audio so there are no files to download.
 * Phones only allow audio after a tap, so the context is unlocked on the first pointer press.
 */
export type SoundName = "deal" | "place" | "confirm" | "flip" | "warn" | "tick" | "win" | "lose" | "scoop" | "reaction";

const KEY = "samkong.sound";
let ctx: AudioContext | null = null;
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
})();

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => audio(), { once: true, capture: true });
}

function tone(ac: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = "sine", gain = 0.12) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Short filtered noise burst: the "swish" of a card. */
function swish(ac: AudioContext, at: number, dur = 0.06, gain = 0.18) {
  const t = ac.currentTime + at;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2400;
  filter.Q.value = 0.8;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t);
}

export const sound = {
  isOn: () => enabled,
  setOn(on: boolean) {
    enabled = on;
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* ignore */
    }
    if (on) sound.play("place");
  },
  play(name: SoundName) {
    const ac = audio();
    if (!ac) return;
    switch (name) {
      case "deal":
        for (let i = 0; i < 13; i++) swish(ac, i * 0.045, 0.05, 0.12);
        break;
      case "place":
        tone(ac, 520, 0, 0.06, "triangle", 0.08);
        break;
      case "confirm":
        tone(ac, 660, 0, 0.09, "triangle");
        tone(ac, 990, 0.08, 0.14, "triangle");
        break;
      case "flip":
        for (let i = 0; i < 6; i++) swish(ac, i * 0.07, 0.04, 0.1);
        break;
      case "warn":
        tone(ac, 880, 0, 0.12, "square", 0.06);
        tone(ac, 880, 0.18, 0.12, "square", 0.06);
        break;
      case "tick":
        tone(ac, 1200, 0, 0.03, "square", 0.03);
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, 0.35 + i * 0.09, 0.22, "triangle"));
        break;
      case "scoop":
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(ac, f, 0.35 + i * 0.07, 0.25, "triangle", 0.14));
        break;
      case "lose":
        [392, 330, 262].forEach((f, i) => tone(ac, f, 0.35 + i * 0.14, 0.25, "sine", 0.1));
        break;
      case "reaction":
        tone(ac, 1320, 0, 0.05, "sine", 0.06);
        tone(ac, 1760, 0.05, 0.06, "sine", 0.05);
        break;
    }
  },
};
