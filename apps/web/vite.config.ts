import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // host: true lets phones on the same Wi-Fi open the dev server (http://<computer-ip>:5173).
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
