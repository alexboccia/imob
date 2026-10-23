# Fase 136 — Redesign visual da página "Agenda"

Status: implementado, testado e publicado.

## Contexto

A área de conteúdo da Agenda (lista de visitas/compromissos, estado
vazio, paginação) nunca tinha um `CabecalhoSecao`: do `<h1>` da página
até o fim, não existia nenhum outro heading real nem ícone — a única
estrutura visível era o agrupamento por período do dia (Manhã/Tarde/
Noite, um `<h2>` simples, sem ícone, só dentro da aba "Hoje").

## O que mudou

`src/app/app/agenda/page.tsx` ganhou um `CabecalhoSecao` (`tom="azul"`)
envolvendo a área de conteúdo, com título/descrição/ícone que mudam
conforme a aba ativa:

| Aba | Título da seção | Ícone |
|---|---|---|
| Solicitações | "Solicitações de visita" | `Inbox` |
| Hoje | "Compromissos de hoje" | `CalendarCheck` |
| Próximas | "Próximas visitas" | `CalendarDays` |
| Anteriores | "Visitas anteriores" | `History` |

Mesmo tratamento já dado a Pipeline (seção "Negociações") e
Características — nenhuma mudança de dado, filtro, paginação ou
permissão.

## Escopo deliberadamente não incluído

O agrupamento por período do dia (Manhã/Tarde/Noite, dentro da aba
"Hoje") continua com o `<h2>` simples de sempre, sem ícone — é um
subnível dentro da seção "Compromissos de hoje", não uma seção própria,
e convertê-lo também criaria um salto de hierarquia que não existia
antes. Fora de escopo desta fase.

## Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` — sem erros.
- `npm run build` — sem erros.
- `npx vitest run` — 3895/3895 passando.
- `tests/e2e/agenda.spec.ts` + `tests/e2e/agendar-visita.spec.ts` —
  **22/23 passando**. A 1 falha ("KPIs renderizam... agenda visita...")
  trava num passo ANTERIOR à própria tela de Agenda (selecionar um
  imóvel num combobox na ficha do cliente) — **confirmado via `git
  stash` que falha identicamente contra o HEAD limpo**, sem nenhuma
  mudança desta fase. Instabilidade pré-existente, não uma regressão.

## Evidência visual

`evidencias/136-agenda-{solicitacoes,hoje,proximas,anteriores}.png` —
cada aba com o cabeçalho de seção correto (ícone, título e descrição
mudando conforme a aba ativa).
