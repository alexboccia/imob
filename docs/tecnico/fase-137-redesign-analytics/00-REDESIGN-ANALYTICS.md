# Fase 137 — Redesign visual completo do Analytics

Status: implementado, testado e publicado. A maior migração da série
(130–137) em número de componentes — 12 cards, em 11 arquivos.

## Contexto

Diferente de todas as páginas anteriores, o Analytics não tinha um
padrão único de cabeçalho: a maioria dos ~10 cards de gráfico/tabela
usava `CardTitle` (um `<div>`, sem semântica de heading) combinado com
`role="region" aria-labelledby="algum-id"` apontando para o `id` desse
título — ou seja, a acessibilidade dependia da ligação ARIA, não de um
heading real. Alguns componentes (`AnalyticsAquisicao`,
`AnalyticsResumoComercial`) já tinham sido corrigidos numa fase
anterior (Fase 68) com um `<h2>` avulso, reaproveitando as mesmas
classes do `CardTitle`, mas sem ícone nem o padrão visual azul das
Fases 129–136.

Essa mistura de três padrões diferentes (`CardTitle`+ARIA, `<h2>` avulso,
e nenhum dos dois em `AnalyticsCarteira`) foi identificada como um
impeditivo real antes de qualquer mudança — reportado ao proprietário,
que autorizou resolver com autonomia total.

## O que mudou

### `CabecalhoSecao` ganhou um prop `id` (retrocompatível)

`src/components/admin/ui/CabecalhoSecao.tsx` — novo prop opcional `id`,
repassado ao elemento de heading. Existe especificamente para que os
cards do Analytics que já usavam `role="region" aria-labelledby="X"`
continuem funcionando: o heading migrado para `CabecalhoSecao` mantém
o MESMO `id` de antes, e a ligação ARIA nunca quebra — `aria-labelledby`
não exige que o elemento alvo esteja dentro do elemento rotulado.
Nenhum outro consumidor de `CabecalhoSecao` (20+ já existentes) é
afetado: o prop é opcional e `undefined` por padrão, igual a antes.

### 12 cards migrados, em 11 arquivos

| Componente | Título | Ícone | `id` preservado? |
|---|---|---|---|
| `AnalyticsSerieContatos` | Evolução dos contatos | `TrendingUp` | não tinha |
| `AnalyticsOrigens` | Origem dos contatos | `Compass` | não tinha |
| `AnalyticsTopImoveis` | Imóveis com mais movimento | `Building2` | não tinha |
| `AnalyticsFunilDigital` | Funil digital | `Filter` | sim |
| `AnalyticsResultado` | Resultado comercial | `Handshake` | sim |
| `AnalyticsResponsaveis` | Performance por responsável | `Users` | sim |
| `AnalyticsParticipacao` | Participação na comissão | `PieChart` | sim |
| `AnalyticsLiquidacao` | Liquidação de comissão | `Banknote` | sim |
| `AnalyticsAquisicao` | Canal de aquisição | `Megaphone` | sim (já era `<h2>`) |
| `AnalyticsResumoComercial` | Resultado no período | `Handshake` | não tinha (sem `role=region`) |
| `AnalyticsCarteira` (×3) | Minhas negociações / Minha participação na comissão / O que não aparece nesta visão | `Handshake` / `PieChart` / `Info` | nenhum tinha |

Todos: `tom="azul"`, mesma descrição/texto de sempre, nenhuma mudança
de dado, cálculo, query ou permissão.

## Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` — sem erros.
- `npm run build` — sem erros.
- `npx vitest run` — 3895/3895 passando.
- `tests/e2e/analytics.spec.ts` + `analytics-escopo.spec.ts` +
  `analytics-tracking.spec.ts` — **65/65 passando, sem nenhuma
  alteração**. Inclui especificamente:
  - "a hierarquia de cabeçalhos não tem salto" — confirma que nenhum
    `<h2>`/`<h3>` ficou órfão ou fora de ordem após a migração.
  - "'Resultado no período' é uma seção real, com heading próprio" —
    valida exatamente a migração de `AnalyticsResumoComercial`.
  - Todos os testes de isolamento/autorização (RESTRICTED/
    COLLABORATIVE), tracking de eventos e responsividade (7
    larguras × 4 abas) — nenhum dependia da estrutura antiga, todos
    continuam passando.

## Evidência visual

`evidencias/137-analytics-{visao-geral,aquisicao,comercial,comissoes,carteira}.png`
— as 4 abas da visão organizacional completa + a visão restrita
("minha carteira"), todos os cabeçalhos de seção com ícone azul.
