import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  /** Optional override in frontend `.env.development.local` — not prefixed with VITE_ (vite.config only). */
  const env = loadEnv(mode, process.cwd(), "");
  const BACKEND_ORIGIN = env.BACKEND_PROXY_TARGET?.trim() || "http://127.0.0.1:8000";

  /** Dev-only: browser calls `/api/*` on the dev server → proxied upstream (no browser CORS to :8000). */
  const apiProxy = {
    "/api": {
      target: BACKEND_ORIGIN,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
    },
  };

  return {
    plugins: [react()],
    server: { proxy: apiProxy },
    preview: { proxy: apiProxy },
  };
});
