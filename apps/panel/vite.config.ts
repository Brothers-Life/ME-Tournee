import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5173 },
  // maplibre-gl pèse ~1 Mo à lui seul (chargé à la demande avec les pages qui affichent une carte).
  build: { chunkSizeWarningLimit: 1200 },
});
