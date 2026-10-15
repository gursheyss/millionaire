import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { voidPlugin } from "void";

export default defineConfig({
  plugins: [voidPlugin(), react(), tailwindcss()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  build: { rollupOptions: { input: "control.html" } },
});
