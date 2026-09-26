import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl({ domains: ["app.agentlatch.test"] }),
  ],
  server: {
    port: 5173,
    host: "127.0.0.1",
    strictPort: true,
    allowedHosts: ["app.agentlatch.test"],
    // Same origin for the page, the API, and the World callback, so the
    // session cookie stays first-party.
    proxy: {
      "/auth": "http://localhost:3001",
      "/api": {
        target: "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
