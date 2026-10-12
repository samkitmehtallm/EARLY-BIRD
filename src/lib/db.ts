import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, has, NotConfiguredError } from "./env";

let client: SupabaseClient | null = null;

/**
 * Server-only Supabase client. Prefers the service-role key; otherwise uses the
 * publishable key plus the `x-app-secret` header that the RLS policies require.
 * The browser never receives either key.
 */
export function db(): SupabaseClient {
  if (!has.db()) throw new NotConfiguredError("Supabase");
  if (client) return client;
  const key = env.supabaseServiceKey ?? env.supabasePublishableKey!;
  client = createClient(env.supabaseUrl!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: env.supabaseServiceKey ? {} : { "x-app-secret": env.supabaseAppSecret! },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return client;
}

/** Throws a readable error when a Supabase call failed. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}
