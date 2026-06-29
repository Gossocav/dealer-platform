import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

const resolvedSupabaseUrl = supabaseUrl;
const resolvedSupabaseAnonKey = supabaseAnonKey;

type StorageScope = "local" | "session";

function getStorageBucket(scope: StorageScope) {
  return scope === "session" ? globalThis.sessionStorage : globalThis.localStorage;
}

function readStorage(key: string, preferredScope: StorageScope) {
  if (typeof window === "undefined") return null;

  const buckets: StorageScope[] = preferredScope === "session" ? ["session", "local"] : ["local", "session"];

  for (const scope of buckets) {
    try {
      const value = getStorageBucket(scope).getItem(key);
      if (value !== null) return value;
    } catch {
      // Ignore storage access failures and fall back to the next bucket.
    }
  }

  return null;
}

function writeStorage(key: string, value: string, preferredScope: StorageScope) {
  if (typeof window === "undefined") return;

  const targetBucket = getStorageBucket(preferredScope);
  const secondaryBucket = getStorageBucket(preferredScope === "session" ? "local" : "session");

  try {
    targetBucket.setItem(key, value);
  } catch {
    // Ignore write failures.
  }

  try {
    secondaryBucket.removeItem(key);
  } catch {
    // Ignore cleanup failures.
  }
}

function removeStorage(key: string) {
  if (typeof window === "undefined") return;

  try {
    globalThis.localStorage.removeItem(key);
  } catch {
    // Ignore cleanup failures.
  }

  try {
    globalThis.sessionStorage.removeItem(key);
  } catch {
    // Ignore cleanup failures.
  }
}

function createBrowserStorage(preferredScope: StorageScope) {
  return {
    getItem: (key: string) => readStorage(key, preferredScope),
    setItem: (key: string, value: string) => writeStorage(key, value, preferredScope),
    removeItem: (key: string) => removeStorage(key),
  };
}

export function createSupabaseBrowserClient(preferredScope: StorageScope = "local") {
  return createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: createBrowserStorage(preferredScope),
    },
  });
}

export const supabase = createSupabaseBrowserClient("local");
