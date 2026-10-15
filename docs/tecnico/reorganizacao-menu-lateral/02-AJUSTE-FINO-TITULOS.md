# 02 — Ajuste fino visual dos títulos de grupo

HEAD anterior a esta entrega: `3405f1b`. Alteração exclusivamente visual — nenhuma rota, permissão, regra de plano, ordem ou item alterado.

## 1. Problema

"CADASTROS E ORGANIZAÇÃO" quebrava em duas linhas, e os 4 títulos de grupo não tinham um padrão visual estritamente uniforme entre si.

## 2. Correção aplicada

| Propriedade | Valor final |
|---|---|
| Tamanho da fonte | **10px** (`text-[10px]`) |
| Peso | **600 / semibold** (`font-semibold`) |
| Cor | cinza secundária já existente (`text-gray-500`, `hover:text-gray-700`) — inalterada |
| Caixa | alta (`uppercase`), inalterado |
| Quebra de linha | `whitespace-nowrap` no título |
| Alinhamento | título à esquerda, seta à direita, via `flex justify-between` — sem centralizar nada |
| Espaçamento entre grupos | **16px** (`space-y-4` no `<nav>`, antes `space-y-1`/4px) |
| Espaçamento entre itens dentro de um grupo | inalterado (`space-y-1` próprio de cada grupo, 4px) |

**Nome definitivo da categoria mais longa: "Cadastros e organização" — mantido por extenso.** Medido diretamente no navegador (Playwright): com os valores acima, o título ocupa 149px de largura dentro de um botão de 207px úteis, com a seta começando em 189px — sem sobreposição e em uma única linha. A abreviação para "Cadastros" prevista como plano B no briefing **não foi necessária**.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/admin/GrupoNavAdmin.tsx` | Classes do `<button>` do cabeçalho do grupo: `text-xs` → `text-[10px]`, `+ whitespace-nowrap`, `+ gap-2` |
| `src/components/admin/AdminSidebarNav.tsx` | `<nav>`: `space-y-1` → `space-y-4` |
| `src/components/admin/AdminMobileNav.tsx` | Idem (mesma mudança, no menu mobile) |
| `tests/e2e/sidebar-admin.spec.ts` | 2 testes novos: padrão visual dos 4 títulos (fonte/peso/1 linha/sem sobreposição) e espaçamento de ~16px entre grupos |

Nenhum outro arquivo foi tocado — confirmado por `git status`/`git diff --stat` antes do commit (ver seção Git).

## 3. Validação visual (Playwright + Chromium)

Medido diretamente no navegador, não apenas inspecionado visualmente:

| Verificação | Resultado |
|---|---|
| Todos os 4 títulos em uma linha | Confirmado (`fontSize: "10px"`, 1 linha calculada por altura/line-height, para os 4) |
| Mesmo alinhamento horizontal | Confirmado — todos começam na mesma coordenada X dentro do botão |
| Seta alinhada à direita | Confirmado — nenhum `sRect.right > svgRect.left` (zero sobreposição) nos 4 |
| Espaçamento uniforme entre categorias | Confirmado — gap medido entre 14-18px (tolerância da medição) nos 4 intervalos (Dashboard→1º grupo, e entre os 3 pares seguintes) |
| Nenhum texto cortado / nenhuma sobreposição | Confirmado pelos dois itens acima |
| Expandido e recolhido | Capturado visualmente nos dois estados (evidências `01` e `02`) |
| Desktop e mobile | Capturado nos dois (evidências `01`/`02` desktop, `03` mobile) |

Evidências em `docs/tecnico/reorganizacao-menu-lateral/evidencias-ajuste-titulos/`:
- `01-desktop-expandido.png`
- `02-desktop-recolhido.png` (os 4 grupos recolhidos, setas giradas)
- `03-mobile-expandido.png`

## 4. Qualidade

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | Aprovado |
| `npx eslint` | Aprovado |
| `npm run build` | Aprovado |
| `npm run test` (unitários + integração) | 3895/3895 |
| `tests/e2e/sidebar-admin.spec.ts` (com os 2 testes novos) | 22/22 |
| `tests/e2e/mobile-nav.spec.ts` + `dashboard.spec.ts` + `entitlements.spec.ts` | 27/27 |

## 5. Preservação confirmada

- Ordem alfabética: inalterada (`TODOS_NAV_LINKS` em `layout.tsx` não foi tocado nesta entrega).
- Grupos, itens, ícones, rotas: inalterados.
- Permissões OWNER/ADMIN/BROKER e regras de plano: inalteradas (nenhuma lógica de autorização ou módulo tocada — só CSS).
- Comportamento de expansão/recolhimento: inalterado (mesma implementação, `useSyncExternalStore` + `aria-expanded`).
- Destaque da página ativa: inalterado.
- Navegação mobile: inalterada, confirmada pelos mesmos testes de sempre + evidência visual nova.

## 6. Git

- Working tree antes desta entrega: mesmos arquivos pendentes de outras fases já documentados em `01-IMPLEMENTACAO.md` (seção Git), inalterados.
- Esta entrega não tocou `src/app/app/layout.tsx` — nenhuma separação de hunks foi necessária desta vez.
- Commit e push: ver relatório final.
