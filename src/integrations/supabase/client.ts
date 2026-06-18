import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing Supabase environment variables: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
}

// Note: we deliberately omit the <Database> generic so that PostgREST's chain
// methods return permissive types. The previous <Database> constraint was causing
// every .from('tablename') chain to collapse to `never` because the placeholder
// Database type (which can't be regenerated without the Supabase CLI) doesn't
// fully match the shape PostgREST's generic resolution requires.
// Once `npx supabase gen types typescript --linked` is run, add the generic back:
//   return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { ... });
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: "pelecanon-auth-token",
  },
});

export default supabase;