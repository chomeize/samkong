/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: { DEFAULT: "#0a1424", 2: "#0e1b30", 3: "#13243d" },
        felt: { DEFAULT: "#0d5c44", deep: "#08402f", hi: "#13775a", line: "#1d8a69" },
        gold: { DEFAULT: "#e7b955", soft: "#f3d58e", deep: "#b88a2b" },
        paper: "#fbfaf6",
        ink: { DEFAULT: "#eef3f8", dim: "#a9b6c8", faint: "#6f7f96" },
        good: "#4ade80",
        bad: "#f87171",
        suitred: "#d1382f",
        suitblack: "#1b1f27",
      },
      fontFamily: {
        display: ['"Prompt"', '"IBM Plex Sans Thai"', "system-ui", "sans-serif"],
        sans: ['"IBM Plex Sans Thai"', '"Noto Sans Thai"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(0,0,0,.25), 0 4px 10px rgba(0,0,0,.22)",
        lift: "0 10px 24px rgba(0,0,0,.35)",
        glow: "0 0 0 2px #e7b955, 0 8px 20px rgba(231,185,85,.35)",
      },
      borderRadius: { card: "0.5rem" },
    },
  },
  plugins: [],
};
