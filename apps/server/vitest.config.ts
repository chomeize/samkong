import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Socket tests use short real timers (deadlines of a few hundred ms). Running files one at a
    // time keeps CPU-heavy work in one file (auto-arrange) from delaying timers in another.
    fileParallelism: false,
  },
});
