# 01 — Reorganização do menu lateral

HEAD inicial (base desta entrega): `36e78ff` (já publicado — ver seção de Git). Nenhuma alteração de outra fase foi incluída neste trabalho.

## 1. Implementação

### 1.1 Arquivos modificados/novos

| Arquivo | Mudança |
|---|---|
| `src/app/app/layout.tsx` | `TODOS_NAV_LINKS` reordenado na nova estrutura de 4 grupos + Dashboard fixo; cada item ganhou um campo `grupo?: string` (substitui o antigo `iniciaGrupo`, Fase 63) |
| `src/lib/nav-grupos.ts` (novo) | `ItemNavAdmin` (tipo central, movido de `AdminSidebarNav.tsx`), `itemAtivo()` (regra de rota ativa, movida de lá também) e `agruparItensNav()` — função pura que separa o Dashboard (sem grupo) dos 4 grupos nomeados, preservando a ordem de primeira aparição |
| `src/components/admin/GrupoNavAdmin.tsx` (novo) | `ItemNavLinkAdmin` (um item — link ativo ou span "Pro" desabilitado) e `GrupoNavAdmin` (cabeçalho recolhível de uma categoria), compartilhados por desktop e mobile |
| `src/components/admin/AdminSidebarNav.tsx` | Reescrito para usar `agruparItensNav` + os dois componentes acima — já não duplica a lógica de item/grupo |
| `src/components/admin/AdminMobileNav.tsx` | Idem — mesmo agrupamento, mesmos componentes, só a casca (Sheet) continua própria do mobile |
| `tests/e2e/sidebar-admin.spec.ts` | Reescrito para a nova ordem/estrutura (ver seção 2) |

Nenhum arquivo de outra fase (Demo, R2, Billing, Pipeline-módulo) foi tocado — a única exceção é `src/app/app/layout.tsx`, que já tinha uma alteração pendente de outra fase (módulo "pipeline" na navegação) misturada na mesma função; essa alteração foi preservada no working tree, não publicada, e o commit desta entrega contém só o trecho da reorganização (ver seção "Git" abaixo).

### 1.2 Estrutura final do menu

```
Dashboard                          (fixo, fora de grupo)

Gestão comercial
  Agenda · Clientes · Imóveis · Minhas comissões · Pipeline

Cadastros e organização
  Características · Contatos a identificar · Empreendimentos · Tipos de imóvel

Gestão e controle
  Analytics · Auditoria · Usuários

Configurações
  Assinatura · Configurações · Manutenção · Meu perfil público
```

17 itens — exatamente os mesmos de antes (nenhum adicionado, removido ou renomeado), confirmado por teste (`sidebar-admin.spec.ts`, "o OWNER vê os mesmos itens de sempre"). Ordem alfabética dentro de cada grupo confirmada por teste dedicado, comparando contra `Array.sort(localeCompare)`.

### 1.3 Comportamento dos grupos

- Cada grupo é um `<button aria-expanded aria-controls>` seguido do conteúdo (ou nada, quando recolhido — removido do DOM, não só escondido via CSS).
- Nascem expandidos (`aria-expanded="true"`) — confirmado por teste.
- Clicar alterna recolhido/expandido; o conteúdo recolhido some do DOM e da árvore de acessibilidade.
- **Preferência persistida** via `localStorage` (`easymob:menu-grupo:{titulo}`), usando `useSyncExternalStore` — mesmo padrão já estabelecido em `src/lib/favoritos-store.ts` para estado de navegador síncrono com React, sem o erro de lint "setState síncrono dentro de efeito" que uma primeira versão (baseada em `useEffect` + `useState`) produziu. `getServerSnapshot` sempre devolve `true` (expandido): o servidor nunca lê o storage, e o primeiro render do cliente concorda com o servidor — sem flash nem aviso de hidratação.
- **Rota ativa força a exibição expandida** do grupo que a contém, mesmo que a preferência salva seja "recolhido" — sem nunca reescrever essa preferência: ao navegar para fora do grupo, ele volta a respeitar a escolha do usuário. Testado explicitamente (recolher "Configurações", navegar direto para `/app/configuracoes`, confirmar reabertura; navegar para fora, confirmar que volta a recolher).
- Nenhuma tabela nem migration nova — a preferência vive inteiramente no navegador.

### 1.4 Design visual

- Nenhum componente novo de design system — reaproveita `Badge`, `cn()`, os mesmos ícones (`ICONES_NAV`) e as mesmas classes de item ativo/hover já existentes.
- Título do grupo: `text-xs font-semibold text-gray-500 uppercase tracking-wide` — discreto, hierarquicamente abaixo dos itens (que continuam `text-sm`).
- `ChevronDown` (14px) gira 90° quando recolhido — único elemento visual novo, decorativo (`aria-hidden`).
- Zero mudança de tipografia, cor, espaçamento ou comportamento dos ITENS em si (ícones, destaque de rota ativa, badge "Pro") — confirmado pelos testes herdados de ícone/tamanho/cor da Fase 62.

## 2. Qualidade

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | Aprovado |
| `npx eslint` | Aprovado (um erro real de `react-hooks/set-state-in-effect` encontrado e corrigido durante a implementação — ver seção 3) |
| `npm run build` | Aprovado |
| `npm run test` (suíte completa, unitários + integração) | **3895/3895** |
| `npx playwright test tests/e2e/sidebar-admin.spec.ts` (reescrita) | **20/20** |
| `npx playwright test tests/e2e/mobile-nav.spec.ts tests/e2e/dashboard.spec.ts` | **26/26** (nenhuma mudança necessária — cobertura por rótulo, não por ordem) |
| `npx playwright test tests/e2e/entitlements.spec.ts` | **1/1** — badge "Pro" por módulo continua funcionando dentro do novo agrupamento |
| **Suíte E2E completa** (gate final) | **1511/1512** — 1 falha (`logs-auditoria-homologacao.spec.ts`, teste de Clientes) não reproduziu isoladamente (12/12 ao rodar só aquele arquivo) — flutuação de carga numa execução de 1512 testes em série, não uma regressão real |

Evidências visuais em `docs/tecnico/reorganizacao-menu-lateral/evidencias/`: `01` (desktop, grupos expandidos), `02` (desktop, um grupo recolhido), `03` (mobile, Sheet com os mesmos 4 grupos).

## 3. Achado real durante a implementação (fora do escopo do menu, mas descoberto testando-o)

Ao rodar a suíte E2E completa (pedida nesta seção de testes) como gate antes de publicar, encontrei uma regressão real **não relacionada ao menu**: em 320-390px, a ficha de Imóvel/Cliente vazava ~190px da viewport por causa dos botões de Arquivar/Excluir definitivamente (entrega anterior, Logs de Auditoria, já publicada). Corrigido e publicado **separadamente** (commit `36e78ff`, antes deste), com justificativa própria — ver seção Git. Mantido aqui só como registro de proveniência: a reorganização do menu não introduziu nem precisava deste ajuste, mas foi o motivo de ele ter sido encontrado agora.

Também durante esta implementação, a primeira versão do `GrupoNavAdmin` usava `useEffect` + `useState` para ler a preferência do `localStorage` depois da montagem — o ESLint acusou `react-hooks/set-state-in-effect` (setState síncrono dentro de um efeito, prática desencorajada). Corrigido reescrevendo com `useSyncExternalStore`, o padrão que o próprio projeto já usa para este tipo de estado (`src/lib/favoritos-store.ts`) — mais correto e mais consistente com a base de código existente, não só uma supressão do aviso.

## 4. Segurança

- **Permissões preservadas**: o recorte por papel continua acontecendo em `src/app/app/layout.tsx` (`NAV_LINKS = TODOS_NAV_LINKS.filter(...)`), ANTES de qualquer agrupamento — `agruparItensNav` só organiza visualmente o que já chegou filtrado. Teste confirma que o corretor (BROKER) continua sem ver "Configurações".
- **Planos preservados**: a mesma lógica de módulo (`hasModule`) resolve `liberado` por item, antes do agrupamento — um item sem módulo habilitado continua aparecendo desabilitado com selo "Pro" (nunca oculto "para completar a categoria visualmente", como a instrução pediu para evitar). Teste confirma (`entitlements.spec.ts`).
- **Isolamento multi-tenant**: nenhuma consulta nova — o menu lê exatamente os mesmos dados (`papel`, `hasModule`) de antes, por organização da sessão.
- **Nenhuma migration**: confirmado — nenhum arquivo em `prisma/migrations/` faz parte desta entrega.
- **Isolamento do deploy**: confirmado abaixo (seção Git) — o commit desta entrega contém exclusivamente os arquivos do menu; as alterações pendentes de outras fases (Demo, R2, Billing, Pipeline-módulo) continuam no working tree, não publicadas.

## 5. Git

- Commits anteriores a esta entrega, já publicados nesta sessão: `b0ed277` (Logs de Auditoria + Comissões) e `36e78ff` (correção de overflow mobile, achado durante a validação desta entrega — seção 3).
- Working tree antes deste commit: 91 arquivos pendentes de outras fases (Demo, R2, Billing, Pipeline-módulo), revisados e explicitamente mantidos fora.
- `src/app/app/layout.tsx` misturava a reorganização do menu com uma linha pendente de outra fase (`modulo: "pipeline"` vs `"crm"` no item Pipeline, Fase 122-A). Separado por staging parcial: a versão com `modulo: "crm"` (o valor já publicado) foi commitada junto com o resto da reorganização; a linha pendente (`"pipeline"`) foi restaurada no working tree logo em seguida, continuando não publicada. Verificado byte a byte que nada mais do arquivo foi perdido.
- Branch: `main`. Push: ver relatório final para confirmação de execução.
