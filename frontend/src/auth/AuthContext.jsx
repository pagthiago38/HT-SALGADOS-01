import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); const [loading, setLoading] = useState(true); const [recovery, setRecovery] = useState(false);
  useEffect(() => { let active = true; supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setLoading(false); } }); const { data: listener } = supabase.auth.onAuthStateChange((event, next) => { setSession(next); setRecovery(event === "PASSWORD_RECOVERY"); setLoading(false); }); return () => { active = false; listener.subscription.unsubscribe(); }; }, []);
  return <AuthContext.Provider value={{ session, user: session?.user || null, loading, recovery, setRecovery, signOut: () => supabase.auth.signOut() }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth precisa estar dentro de AuthProvider"); return value; }
