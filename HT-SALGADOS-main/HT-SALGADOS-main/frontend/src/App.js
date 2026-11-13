import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Vendas from "./pages/Vendas";
import Produtos from "./pages/Produtos";
import Combos from "./pages/Combos";
import Estoque from "./pages/Estoque";
import Despesas from "./pages/Despesas";
import Financeiro from "./pages/Financeiro";
import Adm from "./pages/Adm";
import Relatorios from "./pages/Relatorios";
import Backup from "./pages/Backup";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vendas" element={<Vendas />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/combos" element={<Combos />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/despesas" element={<Despesas />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/adm" element={<Adm />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/backup" element={<Backup />} />
        </Route>
      </Routes>
      <Toaster position="top-center" richColors />
    </BrowserRouter>
  );
}

export default App;
