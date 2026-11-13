import axios from "axios";
import { supabase } from "./supabase";

export const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api` });
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg).join("; ");
  return "Não foi possível concluir. Verifique a conexão.";
};
