import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!url || !key) {
  // The UI remains renderable, but auth calls will show a clear configuration error.
  console.error("Configure REACT_APP_SUPABASE_URL e REACT_APP_SUPABASE_ANON_KEY no frontend/.env");
}

export const supabase = createClient(url || "https://example.supabase.co", key || "missing-public-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
