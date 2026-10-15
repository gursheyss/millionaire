import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  base: "/control/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: { outDir: "../public/control", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:3000", "/show": "http://localhost:3000", "/img": "http://localhost:3000", "/sounds": "http://localhost:3000", "/show.css": "http://localhost:3000", "/show.js": "http://localhost:3000", "/client.js": "http://localhost:3000" } },
});
