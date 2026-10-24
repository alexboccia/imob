# Fase 138 — Redesign visual do Dashboard

Status: implementado, testado e publicado.

## Contexto

O Dashboard (`/app`) já tinha, na maioria dos seus blocos, a arquitetura
de cartão certa — só faltava o acento azul (`tom="azul"`) que vem sendo
aplicado desde a Fase 129. Dois blocos (`DashboardCharts` e
`PrimeirosPassos`) ainda usavam `CardTitle`/`<h2>` avulso em vez de
`CabecalhoSecao`, e precisaram de migração estrutural, não só de cor.

## O que mudou

| Arquivo | Mudança |
|---|---|
| `src/app/app/page.tsx` | `tom="azul"` em "O que precisa da sua atenção" e "Visão geral" |
| `src/components/admin/CentralTrabalho.tsx` | `tom="azul"` em "Agenda" e "Minhas negociações" |
| `src/components/admin/CentralEquipe.tsx` | `tom="azul"` em "Visão da equipe" e "Distribuição por responsável" |
| `src/components/admin/DashboardCharts.tsx` | migrado de `CardHeader`/`CardTitle` para `CabecalhoSecao`, ícones `TrendingUp` ("Desempenho comercial") e `Building2` ("Composição do portfólio"); o filtro Status/Tipo/Bairro (`BarraSegmentada`) passou para o slot `acoes` do cabeçalho |
| `src/components/admin/PrimeirosPassos.tsx` | migrado de `<h2>` avulso para `CabecalhoSecao`, ícone `Rocket`; o `Badge` de itens pendentes continua no slot `titulo` |

Nenhuma mudança de dado, cálculo, query ou permissão em nenhum arquivo.

## O que foi deliberadamente NÃO tocado

- `NovosContatos.tsx` — já usa `<h3>` corretamente, por já estar
  explicitamente documentado como aninhado sob "O que precisa da sua
  atenção".
- `CaptacoesPendentes.tsx` — usa `<h2>` avulso apesar de estar aninhado
  na mesma seção; é uma inconsistência de hierarquia pré-existente,
  mas é uma questão de correção estrutural separada da aplicação do
  padrão visual, fora do escopo desta fase.
- `CompromissosAtrasados.tsx` — usa o `TituloBloco` (`<h3>`) exportado
  por `CentralTrabalho.tsx`, corretamente aninhado.
- `AlternadorVisaoCentral.tsx`, `DashboardKpiCards.tsx` — não têm
  `CabecalhoSecao`/`CardTitle` (confirmado via grep).

## Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` nos 5 arquivos tocados — sem erros.
- `npm run build` — sem erros.
- `npx vitest run` — 3895/3895 passando.
- `tests/e2e/dashboard.spec.ts` + `central-trabalho.spec.ts` +
  `central-equipe.spec.ts` + `onboarding.spec.ts` — 68/69 passando.
  A única falha ("última atividade concluída (Fase 88)") é um timeout
  pré-existente esperando um combobox "Imóvel", **confirmado via
  `git stash` + rebuild + rerun contra HEAD limpo (2/2 falhas
  idênticas)** — não relacionado a esta fase.

## Evidência visual

`evidencias/138-dashboard-completo.png` — Dashboard completo (Org
Central) com os 7 cabeçalhos de seção com ícone azul: Primeiros
passos, O que precisa da sua atenção, Agenda, Minhas negociações,
Visão geral, Desempenho comercial e Composição do portfólio.
