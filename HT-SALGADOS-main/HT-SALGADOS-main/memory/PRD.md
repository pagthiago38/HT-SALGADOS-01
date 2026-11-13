# HT Salgados — PRD

## Original problem statement
HT SALGADOS — SISTEMA COMPLETO DE GESTÃO: sistema de gestão comercial e financeira (Dashboard, Vendas com venda rápida e carrinho, Produtos, Combos, Estoque, Despesas, Financeiro, ADM com distribuição do resultado/pró-labore/dízimo/reserva/lucro, Relatórios diário/semanal/mensal com CSV e PDF, Backup e configurações), responsivo para computador e celular, com as 15 regras financeiras obrigatórias (nunca contar venda/custo duas vezes, dízimo só sobre pró-labore, reserva/investimento não são despesas, sem distribuição com resultado negativo, histórico de correções).
Follow-up (user): "Quero que você adicione na guia de produtos e na de combos, custos editáveis, como: taxa de cartão, embalagem, frete, custos extras, imposto somados para compor o custo unitário do produto que mostre a margem de contribuição e margem de vendas e quero um preço sugerido".

User choices: banco central online já agora; 'Despesas fixas 30%' e 'Custos extras 10%' apenas informativos; 'Saldo total em caixa 10%' = reserva de emergência; sem senha.

## Architecture
- FastAPI + MongoDB (`/app/backend/server.py`), collections: products, combos, sales, stock_movements, expenses, movements, settings, audit_log, counters, snapshots. Dates stored as local (America/Sao_Paulo) YYYY-MM-DD.
- One calculation engine `compute_period` + `distribute` + `cost_breakdown` shared by dashboard/adm/reports/finance; mirrored in `frontend/src/lib/finance.js` for live preview.
- React + shadcn + recharts + jspdf. Pages in `src/pages`, shared UI in `src/components`.

## Financial model
- Unit cost total = merchandise cost + embalagem + frete + extras + (cartão% + imposto%) × price. CMV snapshot per sale uses it.
- Margem de contribuição = (preço − custo total)/preço; margem de venda = (preço − custo mercadoria)/preço; preço sugerido = custos fixos / (1 − (cartão% + imposto% + margem desejada%)).
- Resultado operacional = faturamento − CMV − despesas (exceto Mercadorias) − perdas/vencidos a custo.
- Pró-labore/reserva/investimento by configurable % and base; blocked if result ≤ 0; dízimo % over pró-labore.
- Caixa = saldo inicial + vendas − despesas (todas) − retiradas − investimentos + resgates + aportes − depósitos reserva + retiradas reserva.

## Implemented (2026-11-07)
- All 10 pages, sales with combos (component stock deduction), sale cancel with stock estorno, stock entrada (custo médio + optional compra), perdas/vencidos/ajuste, expenses & financial movements with edit history and cancel, ADM with editable distribution, reports CSV/PDF, JSON backup/restore, daily auto snapshots, reset, audit log, cost composition + suggested price in Produtos/Combos, mobile bottom nav + sticky cart bar.
- Tested: iteration_1 backend 16/16, frontend flows pass; follow-up fixes applied (reserve/investment never negative, date validation, counted ≥ 0, atomic cancel, decimal % inputs, mobile overflow).

## Backlog
- P1: Shared default card fee/tax applied to all products; pt-BR date picker
- P1: Snapshots stored as files (Mongo 16MB doc limit when data grows)
- P2: Login/PIN if the app URL is shared; offline queue for sales
