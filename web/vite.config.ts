import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: `npm run dev` proxies API calls to server.py on 8297.
export default defineConfig({
  plugins: [react()],
  base: "/",
  server: { port: 5297, proxy: { "/api": "http://127.0.0.1:8297", "/legacy": "http://127.0.0.1:8297" } },
  build: { outDir: "dist", chunkSizeWarningLimit: 4000 },
});
