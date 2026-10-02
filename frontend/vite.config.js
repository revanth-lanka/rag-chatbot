import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/chat": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        bypass(req) {
          if (
            (req.headers.accept && req.headers.accept.includes("text/html")) ||
            req.method === "GET"
          ) {
            return "/index.html";
          }
        },
      },
      "/documents": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        bypass(req) {
          if (req.headers.accept && req.headers.accept.includes("text/html")) {
            return "/index.html";
          }
        },
      },
      "/health": "http://127.0.0.1:8000",
      "/providers": "http://127.0.0.1:8000",
      "/retrieval": "http://127.0.0.1:8000",
    },
  },
});
