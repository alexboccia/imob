# Fase 135 — Redesign visual da página "Características"

Status: implementado, testado e publicado.

## Contexto

Diferente das Fases 132/134 (acento de cor só, arquitetura já pronta),
"Características" nunca tinha passado por essa migração: os títulos
dos dois grupos ("Características do imóvel"/"do condomínio") ainda
usavam `CardTitle` (um `<div>`, sem semântica de heading — só o `<h1>`
da página existia como heading real), em vez do `CabecalhoSecao`
(`<h2>` real + ícone) que "Tipos de imóvel" já usa desde a Fase 72 para
o MESMO tipo de tela (catálogo com 2 grupos lado a lado, criação +
busca + remoção).

## O que mudou

`src/components/admin/caracteristicas/CaracteristicasGrupoCard.tsx` —
migrado para o mesmo padrão de `TiposImovelGrupoCard.tsx`:

- `CardHeader`/`CardTitle`/`CardDescription` (dentro do Card) → `<section>`
  com `CabecalhoSecao` (fora do Card), ícone por categoria
  (`ListChecks` para imóvel, `Building2` para condomínio), `tom="azul"`,
  descrição = a mesma contagem de opções de sempre.
- Nenhuma mudança de dado, busca, criação, remoção ou permissão — só a
  casca visual.

## Por que isso é mais que um acento de cor

Ganho real de acessibilidade, não só estético (mesmo achado já
documentado na migração de Tipos de imóvel): os dois grupos passam a
ter um heading de verdade, navegável por leitor de tela/atalho de
heading — antes, a página tinha exatamente UM heading (`<h1>`) do
início ao fim.

## Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` — sem erros.
- `npm run build` — sem erros.
- `npx vitest run` — 3895/3895 passando.
- `tests/e2e/caracteristicas.spec.ts` — **8/8 passando**, após
  atualizar os helpers `grupoImovel`/`grupoCondominio` (localizavam o
  grupo por `[data-slot="card-title"]`, que deixou de existir — agora
  localizam pela `<section>` com o `<h2>` real, mesmo padrão já usado
  em outras specs desta migração). Justificativa: mudança estrutural
  legítima (CardTitle → heading real), não um "fazer passar".

## Evidência visual

`evidencias/135-caracteristicas.png` — os dois cabeçalhos de grupo com
ícone azul e heading real.
