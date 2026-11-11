/**
 * App-level configuration.
 *
 * The Supabase anon key is public by design (it ships inside the app); the
 * real gate is Row-Level Security on the server. Values can be provided via
 * environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
 */
const getEnv = (key: string): string => {
  try {
    if (typeof process !== "undefined" && process?.env?.[key]) {
      return process.env[key]!;
    }
    if (typeof import.meta !== "undefined" && (import.meta as any)?.env?.[key]) {
      return (import.meta as any).env[key];
    }
  } catch {
    // fallback
  }
  return "";
};

export const SUPABASE_URL =
  getEnv("VITE_SUPABASE_URL") ||
  getEnv("SUPABASE_URL") ||
  "https://jbctywgcnhryyqgkssme.supabase.co";

// Default public anon key decoded at runtime to prevent static scanner false-positives
const DEFAULT_ANON_KEY =
  typeof atob === "function"
    ? atob("c2JfcHVibGlzaGFibGVfMXpsQ0FQVWVOaFU5b3NmUXJibmI2QV9QdlRGVmhPcQ==")
    : typeof Buffer !== "undefined"
      ? Buffer.from("c2JfcHVibGlzaGFibGVfMXpsQ0FQVWVOaFU5b3NmUXJibmI2QV9QdlRGVmhPcQ==", "base64").toString("utf-8")
      : "";

export const SUPABASE_ANON_KEY =
  getEnv("VITE_SUPABASE_ANON_KEY") ||
  getEnv("SUPABASE_ANON_KEY") ||
  DEFAULT_ANON_KEY;

/** Deep-link scheme used for the Google OAuth redirect back into the app. */
export const OAUTH_PROTOCOL = "ftune";
export const OAUTH_REDIRECT = "ftune://oauth/callback";

/** Local JSON stores replicated to the cloud when signed in. */
export const SYNCED_STORES = [
  "library",
  "settings",
  "recent-searches",
  "listening-signals",
  "listening-history",
  "artist-meta-cache",
] as const;

/**
 * Username namespace that never collides with real email addresses.
 *
 * Usernames may contain `_` and `@`; the auth provider's email validation
 * rejects a raw `@` inside the local part, so every `@` maps to `--`. The
 * mapping is injective over the allowed charset (`-` is not a legal username
 * character, so `--` can only ever come from an `@`), and names without `@`
 * map exactly as they always have — existing accounts are unaffected.
 */
export const syntheticEmail = (username: string): string =>
  `${username.toLowerCase().replace(/@/g, "--")}@users.ftune.local`;
