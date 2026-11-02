# 03 — Conclusão: Logs de Auditoria, implementação completa

HEAD inicial e final: `a570b6e` (inalterado). Nenhum commit, push, deploy, ou alteração em produção em nenhum momento desta entrega.

## 1. Arquitetura final

Nenhum modelo novo. `ActivityLog` (já existente, já tenant-scoped) continua sendo a única tabela de auditoria técnica por organização. Duas migrations locais novas (seção 6), ambas puramente aditivas.

**Mudança estrutural central**: `logActivity()` (`src/lib/activity-log.ts`) ganhou um segundo parâmetro opcional, `tx` — um cliente de transação Prisma. Sem ele, o comportamento é idêntico ao de sempre (best-effort, nunca bloqueia a operação de negócio). Com ele, uma falha na gravação do log é **relançada**, revertendo a transação inteira (operação de negócio incluída). Compatível com os 40+ pontos de uso que já existiam — nenhum foi obrigado a mudar.

Nova função `diffAuditavel()`, no mesmo arquivo: monta pares `{campo}Antes`/`{campo}Depois` a partir de dois snapshots e uma allowlist de campos — mesma convenção que `PlatformAuditLog` já usava (`src/app/platform/audit/columns.tsx`).

## 2. Arquivos alterados (todos os módulos)

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | `archivedAt`/`archivedByMemberId` em `Property` e `Person` |
| `src/lib/activity-log.ts` | `tx` opcional, `diffAuditavel()` |
| `src/lib/authorization.ts` | `PAPEIS_ARQUIVAMENTO`, `PAPEIS_EXCLUSAO_DEFINITIVA` |
| `src/lib/entitlements.ts` | 3 contagens de limite comercial passam a excluir arquivados |
| `src/lib/listagens-admin-query.ts` | `construirWhereImoveis`/`Clientes` ganham `incluirArquivados`; nova `construirWhereAuditoria` (Etapa 2) |
| `src/app/app/caracteristicas/actions.ts` | Exclusão transacional com o log (Etapa 1, corrigida) |
| `src/app/app/tipos-imovel/actions.ts` | Idem |
| `src/app/app/empreendimentos/actions.ts` | Idem |
| `src/app/app/imoveis/actions.ts` | `atualizarImovel` transacional com antes/depois de preço/status; `arquivarImovel`/`restaurarImovel`/`excluirImovelDefinitivamente` (novas) |
| `src/app/app/clientes/actions.ts` | `atualizarEstagioFunil` com antes/depois (novo); `arquivarCliente`/`restaurarCliente`/`excluirClienteDefinitivamente` (novas) |
| `src/app/app/usuarios/actions.ts` | `atualizarUsuario`/`alternarStatusUsuario` com antes/depois de papel/status, transacional |
| `src/app/app/configuracoes/comissao-actions.ts` | `salvarComissaoPadrao` ganha auditoria (não tinha nenhuma) |
| `src/app/app/auditoria/*` (Etapa 2) | Tela `/app/auditoria`, inalterada nesta entrega |

## 3. Regras de negócio

- **Arquivar ≠ Inativar.** `Property.status` continua descrevendo o estágio comercial; `archivedAt` é ortogonal — tira o registro das listagens da equipe sem tocar em status, preço, ou qualquer outro campo. Confirmado por teste direto (`status` permanece `AVAILABLE` depois de arquivar).
- **Arquivamento é reversível** e nunca reaplica o limite comercial na restauração (decisão registrada: um registro que já existia não é um cadastro novo).
- **Exclusão definitiva é irreversível**, exige confirmação digitada (nome/título exato, verificado no servidor) e tem dependências reais verificadas:
  - **Property**: bloqueada nativamente pelo banco (FK `RESTRICT` em `deals`/`property_interests`, confirmado em `pg_constraint`) se houver negociação ou compromisso vinculado.
  - **Person**: `property_interests.personId` é `CASCADE` no banco — deliberadamente **bloqueada manualmente** antes de qualquer exclusão, para nunca apagar negociações/ofertas/pagamentos em cascata silenciosa.
- **Arquivos no R2** só são removidos depois que o banco confirma a exclusão (mesma ordem já estabelecida em `atualizarImovel`), nunca antes.

## 4. Permissões

| Ação | Quem |
|---|---|
| Arquivar/restaurar Imóvel ou Cliente | `PAPEIS_ARQUIVAMENTO` (OWNER/ADMIN/MANAGER) |
| Excluir definitivamente Imóvel ou Cliente | `PAPEIS_EXCLUSAO_DEFINITIVA` (OWNER/ADMIN apenas) |
| Ver a tela de auditoria | `PAPEIS_GESTAO_CONFIGURACOES` (OWNER/ADMIN) — Etapa 2, inalterado |

## 5. Eventos auditados (visão consolidada)

| Módulo | Ação | Antes/depois? |
|---|---|---|
| Imóveis | `created`, `updated` (preço/status), `archived`, `restored`, `deleted_permanently` | Sim (updated) |
| Clientes | `created`, `updated`, `person_owner_claimed`/`assigned` (já existia), `pipeline_stage_updated` (novo), `archived`, `restored`, `deleted_permanently` | Sim |
| Usuários | `updated` (papel/status), `public_profile_enabled/disabled` | Sim (papel/status) |
| Configurações | `default_commission_percent_updated` (novo — módulo sem nenhuma auditoria antes) | Sim |
| Empreendimentos/Características/Tipos | `deleted` (Etapa 1, agora transacional) | N/A (exclusão) |

## 6. Migrations locais (nunca aplicadas em produção)

1. `20261015025514_add_archiving_property_person` — `archivedAt`/`archivedByMemberId` em `properties`/`people`, 2 FKs `SET NULL` para `organization_members`. Puramente aditiva.

Aplicada e testada no banco de desenvolvimento e no banco de teste local. **Não aplicada em produção.**

## 7. Estratégia de atomicidade — comprovada, não só declarada

Teste real (não mockado): dentro do mesmo `prisma.$transaction`, uma exclusão real seguida de um `logActivity(tx)` com `organizationId` inválido (viola FK de verdade) — resultado: **a exclusão também reverteu**. Ver `tests/integration/auditoria-exclusoes-catalogo.test.ts`, describe "atomicidade".

**Achado real durante a implementação**: `vi.spyOn(prisma.activityLog, "create")` não intercepta o cliente de transação (`tx`) — são instâncias diferentes. Documentado explicitamente no teste, para que ninguém tente o mesmo mock no futuro esperando que funcione.

## 8. Segurança multi-tenant

Todas as novas queries (archive/restore/delete/pipeline/comissão) usam `organizationId` explícito no `where`, nunca confiam só no contexto assíncrono. Testado explicitamente o cenário mais rigoroso: **mesmo usuário com membership em duas organizações diferentes** (Etapa 2) — o filtro por usuário nunca atravessa tenant.

## 9. Bug real encontrado e corrigido durante os testes

`diffAuditavel` comparava valores **antes** de normalizá-los — `Property.price` é `Prisma.Decimal`, e duas instâncias com o **mesmo valor numérico nunca são `===`** entre si. Isso marcava toda edição de imóvel como "preço mudou", mesmo sem mudança real. Corrigido normalizando ambos os lados antes de comparar, com teste dedicado provando o caso (`src/lib/activity-log.test.ts`).

## 10. Testes e resultados

| Suíte | Testes | Resultado |
|---|---|---|
| `src/lib/activity-log.test.ts` (novo) | 9 | Passou |
| `src/lib/authorization.test.ts` (+2 blocos) | +15 | Passou |
| `src/lib/listagens-admin-query.test.ts` (+1 bloco, Etapa 2) | +7 | Passou |
| `tests/integration/auditoria-exclusoes-catalogo.test.ts` (Etapa 1 + atomicidade) | 9 | Passou |
| `tests/integration/auditoria-tela.test.ts` (Etapa 2) | 7 | Passou |
| `tests/integration/auditoria-antes-depois.test.ts` (novo) | 6 | Passou |
| `tests/integration/auditoria-arquivamento-exclusao.test.ts` (novo) | 15 | Passou |
| **Suíte completa do projeto** | **3893/3893** | **Passou, zero regressões** |
| `npx tsc --noEmit` | — | Aprovado |
| `npm run lint` | — | Aprovado |
| `npm run build` | — | Aprovado |

E2E (Playwright) não foi reexecutado — nenhuma tela nova foi construída nesta entrega (só Server Actions e a tela de auditoria já existente da Etapa 2), fora do alcance visual do Playwright sem uma suíte nova dedicada.

## 11. Limitações e riscos residuais

1. **Nenhuma interface visual para arquivar/restaurar/excluir definitivamente foi construída** (seção 13, classificação abaixo) — as Server Actions existem, são seguras e testadas, mas não há botão na tela hoje. Decisão explícita: construir uma UI de confirmação reforçada (texto digitado, aviso de irreversibilidade, diferenciação visual Arquivar/Excluir) para duas telas (Imóveis, Clientes) é um trabalho de frontend não trivial, e fazer isso apressadamente arriscaria inconsistência com o design system — melhor entregar com cuidado numa próxima etapa autorizada do que arriscar.
2. **Homologação visual não realizada** — sem ferramenta de navegador neste ambiente (mesma limitação já registrada na Etapa 2).
3. **Assinaturas**: não instrumentado — não existe hoje nenhuma Server Action de mutação de assinatura no nível do tenant (`/app/assinatura` é informativo); mudanças de plano acontecem só no nível `/platform`, já coberto por `PlatformAuditLog` (pré-existente). Nada para auditar que já não esteja.
4. **Pipeline/Deals** (a entidade `Deal`, distinta de `Person.pipelineStage`): não investigado a fundo — o campo `pipelineStage` de `Person` (usado pela tela `/app/pipeline`) foi instrumentado; a entidade `Deal` em si não teve nenhuma Server Action de mutação clara identificada dentro do tempo desta entrega.
5. **Retenção de `ActivityLog`**: segue sem política definida (decisão comercial/produto, registrada desde o diagnóstico original).

## 12. Procedimento de homologação (checklist para o proprietário)

- [ ] Revisar os 2 novos papéis (`PAPEIS_ARQUIVAMENTO`, `PAPEIS_EXCLUSAO_DEFINITIVA`) e confirmar que o nível de autoridade está certo.
- [ ] Decidir se/quando autorizar a construção da UI de arquivamento/exclusão (próxima etapa).
- [ ] Revisar a migration local (`20261015025514_add_archiving_property_person`) antes de autorizar aplicá-la em produção.
- [ ] Confirmar que o escopo de "Pipeline"/"Assinaturas" registrado como não coberto é aceitável, ou apontar a Server Action específica que deveria ser instrumentada.

## 13. Plano seguro de deploy futuro (quando autorizado)

1. Commit + push desta implementação (Server Actions + migration local), revisão de código.
2. Aplicar a migration em produção via o fluxo já existente (Job `imob2`, `MIGRATE_DEPLOY_MODE=apply` — ver Fase 127).
3. Construir e homologar a UI de arquivamento/exclusão, com autorização própria.
4. Só então liberar aos usuários finais.

Nada disso foi executado nesta entrega.
