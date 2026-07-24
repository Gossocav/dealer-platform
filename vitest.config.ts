import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Test-only config. Two things the suite needs and previously lacked:
// 1. the "@/..." path alias (mirrors tsconfig paths) so tests can import app
//    modules the same way the app does;
// 2. placeholder Supabase env vars, because a few modules read them at import
//    time and throw when unset. These are never real credentials.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
