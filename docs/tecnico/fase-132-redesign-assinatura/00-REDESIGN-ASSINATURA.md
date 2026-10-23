# Fase 132 — Acento visual azul na página "Assinatura"

Status: implementado, testado e publicado.

## Contexto e escopo

Terceira aplicação do padrão visual das Fases 129/130/131 ("aplicar em
todas as páginas administrativas, uma por vez"). Diferente das duas
anteriores, "Assinatura" já tinha sido redesenhada na Fase 75 com a
MESMA arquitetura que o resto do backoffice usa hoje
(`CabecalhoPagina` + `CabecalhoSecao` + `Card`/`CartaoEstatistica`) —
não havia estrutura pra refazer, só faltava o acento de cor azul que
diferencia as páginas já alinhadas ao novo padrão.

## O que mudou

`src/app/app/assinatura/page.tsx` — as duas seções da página
(`CabecalhoSecao` do nome do plano e `CabecalhoSecao` de "Contratação")
ganharam `tom="azul"`. Dois pontos, nenhuma outra mudança.

## O que NÃO mudou (deliberado)

Os três `CartaoEstatistica` (Mensalidade, Imóveis ativos, Usuários
ativos) continuam com `tom="marca"` — o tom neutro/configurável da
marca da imobiliária, o MESMO componente compartilhado por outras 7
páginas (Dashboard, Pipeline, Clientes, Imóveis, Usuários, Agenda,
Analytics, Características). `tom` naquele componente é semântico
("marca" = fato neutro; "info"/azul já existe como opção, mas tem outro
significado: destaque informativo, não "esta é uma página redesenhada").
Mudar esses três cards para "info" quebraria essa semântica
cross-página sem necessidade — a inconsistência visual real estava
nos ícones de SEÇÃO, não nos KPIs.

## Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` — sem erros.
- `npm run build` — sem erros.
- `npx vitest run` — 3895/3895 passando.
- `tests/e2e/assinatura.spec.ts` — **16/16 passando, sem nenhuma
  alteração** (nenhum teste depende de cor, só de texto/estrutura).

## Evidência visual

`evidencias/assinatura-1440.png` — os dois ícones de seção em azul
sobre fundo azul-claro; KPIs mantendo o cinza neutro de sempre.
