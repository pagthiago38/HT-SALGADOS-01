import React, { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      if (!process.env.REACT_APP_SUPABASE_URL || !process.env.REACT_APP_SUPABASE_ANON_KEY) throw new Error("Falta configurar as variáveis do Supabase em frontend/.env.");
      let result;
      if (mode === "register") result = await supabase.auth.signUp({ email, password });
      else if (mode === "recover") result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
      else result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setMessage(mode === "register" ? "Cadastro enviado. Confira seu e-mail para confirmar a conta." : mode === "recover" ? "Enviamos um link de recuperação para seu e-mail." : "Acesso autorizado.");
    } catch (err) { setMessage(err.message || "Não foi possível concluir."); }
    finally { setBusy(false); }
  };
  const title = mode === "login" ? "Acesse sua gestão" : mode === "register" ? "Criar acesso" : "Recuperar senha";
  return <div className="min-h-screen flex items-center justify-center bg-[#0F141C] px-4 py-10">
    <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
      <div className="mb-7 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-xl font-extrabold text-white">HT</div><div><div className="font-display text-xl font-extrabold text-slate-900">HT Salgados</div><div className="text-xs uppercase tracking-[.2em] text-slate-500">Gestão</div></div></div>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1><p className="mt-1 mb-6 text-sm text-slate-500">Entre com seu e-mail e senha para acessar seus dados.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold text-slate-700">E-mail<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-500" placeholder="voce@email.com" /></label>
        {mode !== "recover" && <label className="block text-sm font-semibold text-slate-700">Senha<input type="password" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-orange-500" placeholder="Mínimo de 6 caracteres" /></label>}
        <button disabled={busy} className="w-full rounded-lg bg-orange-500 px-4 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-60">{busy ? "Aguarde..." : mode === "login" ? "Entrar" : mode === "register" ? "Criar conta" : "Enviar recuperação"}</button>
      </form>
      {message && <p role="status" className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-800">{message}</p>}
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm"><button className="text-orange-700 hover:underline" onClick={()=>{setMode(mode === "login" ? "recover" : "login");setMessage("")}}>{mode === "login" ? "Esqueci minha senha" : "Voltar ao login"}</button><button className="text-slate-600 hover:underline" onClick={()=>{setMode(mode === "register" ? "login" : "register");setMessage("")}}>{mode === "register" ? "Já tenho conta" : mode === "login" ? "Criar conta" : ""}</button></div>
    </div>
  </div>;
}
