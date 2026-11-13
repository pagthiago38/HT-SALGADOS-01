import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Package, Boxes, Layers, Receipt, Wallet, Calculator, BarChart3, Database, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { useAuth } from "../auth/AuthContext";

export const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { to: "/vendas", label: "Vendas", icon: ShoppingCart, id: "vendas" },
  { to: "/produtos", label: "Produtos", icon: Package, id: "produtos" },
  { to: "/combos", label: "Combos", icon: Boxes, id: "combos" },
  { to: "/estoque", label: "Estoque", icon: Layers, id: "estoque" },
  { to: "/despesas", label: "Despesas", icon: Receipt, id: "despesas" },
  { to: "/financeiro", label: "Financeiro", icon: Wallet, id: "financeiro" },
  { to: "/adm", label: "ADM", icon: Calculator, id: "adm" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, id: "relatorios" },
  { to: "/backup", label: "Backup e config.", icon: Database, id: "backup" },
];

const Brand = () => (
  <div className="flex items-center gap-3 px-2">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 font-display text-lg font-extrabold text-white shadow-lg shadow-orange-500/30">HT</div>
    <div>
      <p className="font-display text-base font-bold leading-tight text-white">HT Salgados</p>
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Gestão</p>
    </div>
  </div>
);

const NavItems = ({ onNavigate, prefix }) => (
  <nav className="mt-8 flex flex-col gap-1">
    {NAV.map(({ to, label, icon: Icon, id }) => (
      <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate} data-testid={`${prefix}-${id}-link`}
        className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
);

const MOBILE = ["/", "/vendas", "/estoque", "/adm"];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-[#F6F3EE]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#0F141C] px-4 py-6 lg:flex">
        <Brand />
        <NavItems prefix="sidebar" />
        <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />Dados salvos automaticamente no banco central
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#0F141C] px-4 py-3 lg:hidden">
        <Brand />
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-white" data-testid="mobile-menu-btn" aria-label="Menu">
          <Menu className="h-6 w-6" />
        </button>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-none bg-[#0F141C] p-5">
          <SheetHeader><SheetTitle className="sr-only">Menu</SheetTitle></SheetHeader>
          <Brand />
          <NavItems prefix="drawer" onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="lg:pl-64">
        <div key={loc.pathname} className="mx-auto w-full max-w-[1500px] p-4 pb-28 sm:p-6 lg:p-10 lg:pb-12">
          <div className="mb-5 flex flex-wrap items-center justify-end gap-3 text-xs text-slate-500"><span>{user?.email}</span><button onClick={signOut} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:border-orange-400">Sair</button></div>
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden">
        {NAV.filter((n) => MOBILE.includes(n.to)).map(({ to, label, icon: Icon, id }) => (
          <NavLink key={to} to={to} end={to === "/"} data-testid={`bottom-${id}-link`}
            className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? "text-orange-600" : "text-slate-500"}`}>
            <Icon className="h-5 w-5" />{label}
          </NavLink>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-slate-500" data-testid="bottom-more-btn">
          <Menu className="h-5 w-5" />Mais
        </button>
      </nav>
    </div>
  );
}
