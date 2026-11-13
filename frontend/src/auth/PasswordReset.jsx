import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
export default function PasswordReset() {
  const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const { setRecovery, signOut } = useAuth();
  const submit = async (e) => { e.preventDefault(); setBusy(true); setMessage(""); const { error } = await supabase.auth.updateUser({ password }); setBusy(false); if (error) setMessage(error.message); else { setMessage("Senha atualizada. Faça login novamente."); setRecovery(false); await signOut(); } };
  return <div className="min-h-screen flex items-center justify-center bg-[#0F141C] p-4"><form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8"><h1 className="text-2xl font-bold">Criar nova senha</h1><label className="mt-5 block text-sm font-semibold">Nova senha<input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border p-3" /></label><button disabled={busy} className="mt-4 w-full rounded-lg bg-orange-500 p-3 font-bold text-white">{busy ? "Salvando..." : "Salvar senha"}</button>{message && <p className="mt-3 text-sm text-slate-700">{message}</p>}</form></div>;
}
