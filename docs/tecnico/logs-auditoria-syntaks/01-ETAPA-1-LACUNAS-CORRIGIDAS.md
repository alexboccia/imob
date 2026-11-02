# 01 — Etapa 1: correção das lacunas de auditoria

Checkpoint 1. HEAD inicial e final: `a570b6e` (inalterado — nenhum commit, push, deploy, migration ou alteração no Neon de produção).

## 1. O que foi implementado

As 3 exclusões reais que o diagnóstico encontrou sem nenhum rastro agora gravam `ActivityLog`, reutilizando integralmente o mecanismo existente (`logActivity()`, `src/lib/activity-log.ts`) — nenhum modelo novo, nenhuma migration.

| Entidade | Ação registrada | Payload preservado |
|---|---|---|
| `Development` (empreendimento) | `deleted` | `{ name }` |
| `FeatureOption` (característica) | `deleted` | `{ name, category }` |
| `PropertyTypeOption` (tipo de imóvel) | `deleted` | `{ name, category }` |

Em todos os 3 casos, o identificador útil (nome, e categoria quando aplicável) é capturado **antes** do registro deixar de existir — via o próprio retorno de `prisma.delete()` (que devolve o registro apagado) nos dois últimos, e via uma consulta já existente (estendida com `name`) no primeiro, que já buscava o registro para checar dependências.

## 2. O que NÃO foi alterado

- Nenhuma migration, nenhum campo novo no schema.
- Nenhuma mudança de comportamento funcional das exclusões (mesmas regras de permissão, mesmo bloqueio de dependências no caso de empreendimentos).
- `logActivity()` em si não foi modificado — continua best-effort, não-transacional com a operação de negócio (mesmo padrão já usado em todo o projeto; ver seção 7 abaixo sobre a avaliação de consistência transacional).
- Nenhuma tela nova, nenhuma API nova.
- Nenhum dado real de produção foi tocado — tudo validado em banco de teste local.

## 3. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/app/app/empreendimentos/actions.ts` | Import de `logActivity`; `select` do `alvo` estendido com `name`; chamada de `logActivity` após `deleteMany` bem-sucedido |
| `src/app/app/caracteristicas/actions.ts` | Import de `logActivity`; captura do retorno de `delete()`; chamada de `logActivity` |
| `src/app/app/tipos-imovel/actions.ts` | Import de `logActivity`; captura do retorno de `delete()`; chamada de `logActivity` |
| `tests/integration/auditoria-exclusoes-catalogo.test.ts` (novo) | 7 testes cobrindo as 3 exclusões + autorização + isolamento multi-tenant |

## 4. Testes executados

**Novo arquivo de teste** (`tests/integration/auditoria-exclusoes-catalogo.test.ts`), 7 cenários, todos contra banco de teste real (nunca produção, nunca o banco de restauração da Fase 127-A3):

| # | Cenário | Resultado |
|---|---|---|
| 1 | Excluir empreendimento grava `ActivityLog` com autor, entidade e nome preservado | Passou |
| 2 | Excluir característica grava `ActivityLog` com nome e categoria | Passou |
| 3 | Excluir tipo de imóvel grava `ActivityLog` com nome e categoria | Passou |
| 4 | Exclusão não autorizada (BROKER) é recusada e **não gera log nenhum** | Passou |
| 5 | Exclusão num tenant nunca aparece no log de outro tenant | Passou |
| 6 | Tentativa de excluir registro de **outro** tenant é recusada (erro, não silêncio) e não gera log em nenhum dos dois lados | Passou |
| 7 | Registro excluído continua consultável no histórico (o log sobrevive à exclusão do próprio registro) | Passou |

**Gates completos** (mudança real de código de produção):
- `npx tsc --noEmit` — aprovado.
- `npm run lint` — aprovado.
- `npm run test` — **3840/3840** (3833 anteriores + 7 novos), zero regressões.
- `npm run build` — aprovado.

E2E não foi reexecutado — nenhuma tela foi alterada, só Server Actions de backend, fora do alcance visual do Playwright nesta etapa.

## 5. Resultados — confirmação direta dos critérios pedidos

- **Exclusão autorizada gera evento**: confirmado (testes 1-3).
- **Exclusão não autorizada é bloqueada**: confirmado, e **sem gerar log algum** (teste 4) — a ação recusa antes de tocar no banco, então não haveria nada a logar mesmo.
- **Tentativa de acesso a outro tenant é bloqueada**: confirmado (teste 6) — o mecanismo de isolamento (`where: { id, organizationId }` no `delete()`) já existia e continua intacto; a chamada cruzada lança exceção, nenhuma linha é tocada, nenhum log é criado em nenhum dos dois tenants.
- **Operação que falha não gera evento falso de sucesso**: confirmado (teste 6) — `logActivity()` só é chamado DEPOIS do `delete()` ter retornado com sucesso; se o `delete()` lança (P2025, registro não encontrado), a execução nunca chega à linha do log.
- **Exclusão concluída não fica sem auditoria**: confirmado no caminho feliz (testes 1-3, 7). Ver seção 7 sobre o caso de falha exclusiva do log em si.
- **Histórico continua consultável após a exclusão do registro**: confirmado (teste 7) — o log é uma linha independente em `activity_logs`, nunca referencia o registro original por relação obrigatória (`entityId` é só uma string).

## 6. Riscos

Nenhum risco novo introduzido. Os 3 pontos de exclusão mantêm exatamente o mesmo comportamento de autorização e isolamento de antes — a única adição é uma escrita extra (best-effort) depois do sucesso da exclusão.

## 7. Consistência transacional — avaliada, não alterada nesta etapa

Conforme pedido ("avaliar consistência transacional"): `logActivity()` usa o client Prisma global, nunca um `tx` — isso significa que, no caso extremamente raro de a escrita do log falhar exatamente depois da exclusão já ter sido confirmada (ex: banco sob pressão momentânea), a exclusão permanece válida e **não gera log**. Isso é uma limitação conhecida e documentada do próprio `src/lib/activity-log.ts` ("nunca deve bloquear a operação principal"), replicada aqui intencionalmente, para manter o comportamento consistente com os outros 40+ pontos de uso já existentes no projeto — **não foi uma escolha nova feita nesta etapa**, é a mesma arquitetura já em produção.

Mudar isso (dar a `logActivity()` a capacidade de participar de uma transação, usada seletivamente nos fluxos de exclusão) é uma decisão de arquitetura explicitamente registrada como pendente no diagnóstico (seção 13.C) — não foi implementada aqui para não misturar uma mudança estrutural ampla (que afetaria os outros 40+ call sites, ou exigiria uma segunda função paralela) com a correção pontual desta etapa.

## 8. Necessidade de migration

Nenhuma. O modelo `ActivityLog` já suporta tudo que esta etapa precisava.

## 9. Impacto esperado na produção (quando publicado)

Nenhum impacto funcional visível para o usuário — as 3 exclusões continuam se comportando exatamente igual. O único efeito é 1 escrita adicional, pequena, em `activity_logs`, por exclusão de empreendimento/característica/tipo de imóvel — operação já comprovadamente barata (98 linhas reais na tabela hoje, ver Fase 127-A3).

## 10. Próximo checkpoint

**Etapa 2 — Tela de Logs de Auditoria.** Aguardando autorização explícita do proprietário antes de iniciar.
