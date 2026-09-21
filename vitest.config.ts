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
    // **L'esito di un'esecuzione sopravvive all'esecuzione.**
    //
    // Il 21/09/2026 un guardiano e' diventato rosso una volta sola e il
    // messaggio e' andato perso: il comando finiva in `| tail -12`, che ha
    // tenuto la coda e buttato via l'asserzione. Quindici esecuzioni
    // successive sono passate, e di quel rosso non e' rimasto niente da
    // leggere -- ne' cosa non tornava, ne' se fosse un guasto o una
    // proprieta' violata.
    //
    // Non e' un difetto del test: e' che **l'unico posto dove l'esito viveva
    // era lo schermo**. Adesso ogni esecuzione lascia un file, sempre, verde
    // o rossa che sia, e chi la osserva puo' filtrare quanto vuole senza
    // perdere niente. Il file non si versiona (`.gitignore`): e' il verbale
    // dell'ultima esecuzione, non un documento del progetto.
    reporters: [
      ["default", {}],
      ["json", { outputFile: "./.esiti-dei-test.json" }],
    ],
  },
});
