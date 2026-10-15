# Diagnóstico — Logs de Auditoria de Usuários (EasyMob)

Diagnóstico técnico puro. Nenhuma migration, alteração de schema, de banco ou de interface foi feita. HEAD do repositório preservado.

## 1. Resumo executivo

O EasyMob **já possui infraestrutura real de auditoria tenant-scoped, ativa em produção há várias fases, mas 100% invisível** — o modelo `ActivityLog` é escrito por 13 arquivos diferentes, cobrindo boa parte dos módulos principais, porém **nenhuma tela ou API jamais lê essa tabela**. É um cofre cheio sem porta. A segunda peça (nível plataforma, `PlatformAuditLog`) já tem UI funcional em `/platform/audit` — e serve de modelo pronto para copiar.

As lacunas reais não são "criar auditoria do zero": são (1) construir a tela que falta, (2) preencher os módulos que não escrevem no log nenhum (Pipeline/Deals, Comissões, Assinaturas/Planos, Empreendimentos, Características, Tipos de Imóvel), (3) capturar valores antes/depois nas edições (hoje nenhuma edição grava `payload` com o que mudou), e (4) resolver que **hoje não existe exclusão de clientes/imóveis na aplicação** — o exemplo citado pelo proprietário ("um corretor... excluir um cliente") não corresponde a uma funcionalidade existente.

## 2. Situação atual

### 2.1 — `ActivityLog` (nível tenant) — já existe, já é escrito, nunca é lido

`prisma/schema.prisma:2387`:
```prisma
model ActivityLog {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  userId         String?
  entity         String
  entityId       String?
  action         String
  payload        Json?
  createdAt      DateTime     @default(now())

  @@index([organizationId, createdAt])
  @@index([organizationId, entity, entityId])
  @@map("activity_logs")
}
```

- **Já está em `TENANT_SCOPED_MODELS`** (`src/lib/prisma.ts:35`) — o mesmo mecanismo fail-closed que isola todos os outros dados multi-tenant já protege esta tabela. Nada novo a construir aqui.
- **Serviço central**: `src/lib/activity-log.ts` — função única `logActivity()`, chamada em 40+ pontos do código.
- **Confirmado em produção**: 98 linhas reais na tabela `activity_logs` (ver `27-RESTAURACAO-ISOLADA-EXECUTADA-127A3.md`, Fase 127-A3 — contagem agregada do backup real restaurado).

### 2.2 — Módulos que **já** escrevem em `ActivityLog` hoje

| Módulo | Arquivo | Ações cobertas |
|---|---|---|
| Imóveis | `src/app/app/imoveis/actions.ts` | `created`, `updated` (sem payload — ver lacuna 3.1) |
| Clientes (Person) | `src/app/app/clientes/actions.ts` | `created`, `updated`, preferências, interesses criados/removidos/favoritados, atribuição de responsável |
| Usuários (OrganizationMember/User) | `src/app/app/usuarios/actions.ts`, `convite/[token]`, `meu-perfil`, `trocar-organizacao`, `redefinir-senha` | convite enviado/reenviado/aceito, dados atualizados, perfil público ativado/desativado, troca de senha, troca de organização |
| Agenda (ScheduledActivity) | `src/app/app/agendamentos/actions.ts` | criação, reagendamento, cancelamento, follow-up, confirmação/descarte de visita, mudança de estágio do interesse |
| Configurações (branding) | `src/app/app/configuracoes/actions.ts` | atualização de identidade visual, tema customizado |
| Captação de leads | `src/app/app/captacoes/actions.ts` | resolução de identidade de lead |
| Upload de mídia | `src/app/api/admin/upload/route.ts` | sucesso e erro de upload |
| Cadastro de organização | `src/app/cadastro/[token]/actions.ts` | criação da organização |
| Login | `src/lib/auth.ts:79` | evento de autenticação |

### 2.3 — `PlatformAuditLog` (nível plataforma) — já tem UI real, serve de modelo

`prisma/schema.prisma:2521` + `src/app/platform/audit/page.tsx` (completo, funcional): tabela com busca, filtro por ação e por operador, paginação (`DataTable`/`FiltroDropdown`/`interpretarPaginacao`/`interpretarFiltros` — componentes genéricos já usados em outras telas administrativas do projeto). **Este é exatamente o padrão a copiar** para a versão tenant-facing — mesma stack de componentes, troca `platformAuditLog` por `activityLog`, `platformOperatorId` por `userId`, adiciona o filtro de `organizationId` (automático, via tenant-scoping).

### 2.4 — Históricos funcionais especializados (não substituem auditoria técnica, mas já cobrem parte do "quem mudou o quê")

- `PropertyStatusHistory` (`prisma/schema.prisma:791`): toda transição de status de um imóvel (incluindo `INACTIVE` — o equivalente funcional a "remover" um imóvel, já que **não existe soft delete real**) grava `previousStatus`, `newStatus`, `changedAt`, `changedByMemberId`. Já responde "quem mudou o status e quando", mas não cobre mudança de preço/outros campos.
- `PropertyInterestStageHistory` (`prisma/schema.prisma:1344`): histórico de estágio do funil de interesse — análogo ao acima, para negociações.

### 2.5 — Soft delete: **não existe em lugar nenhum do schema**

```
grep "deletedAt" prisma/schema.prisma → 0 resultados
```

Toda exclusão no projeto é **hard delete** (`prisma.X.delete`/`deleteMany`). Implicação direta: um registro excluído desaparece por completo — não há como auditar "o que foi excluído" a partir do próprio registro, só a partir de um log externo a ele (ou seja, a auditoria é a *única* forma possível de reconstruir isso, tornando-a ainda mais necessária do que em um sistema com soft delete).

### 2.6 — **Achado crítico: não existe exclusão de Imóvel nem de Cliente na aplicação hoje**

Busquei em todo `src/app/app/` por `property.delete`/`person.delete` (os modelos de Imóvel e Cliente) — **zero ocorrências**. As únicas duas chamadas de `property.deleteMany`/`person.deleteMany` em todo o projeto estão em `src/app/platform/organizations/[id]/actions.ts:465-466`, dentro de `deletarOrganization()` — ou seja, só quando o **Super Admin da plataforma exclui a imobiliária inteira**, nunca numa ação de usuário comum excluindo um imóvel ou cliente individual.

**Consequência direta**: o exemplo dado na demanda ("se um corretor... excluir um cliente") **não corresponde a nenhuma funcionalidade existente no EasyMob hoje**. O que existe, para imóveis, é a transição de status para `INACTIVE` (já com rastro parcial via `PropertyStatusHistory`). Para clientes, **não existe nenhuma forma de removê-los** — nem exclusão, nem arquivamento, nem status análogo. Isso precisa ser esclarecido com o proprietário antes de prosseguir (ver seção 14, decisão pendente).

### 2.7 — Módulos que **não** escrevem em `ActivityLog` hoje (lacuna real)

| Módulo | Evidência de ausência |
|---|---|
| Pipeline / Negociações (`Deal`) | Nenhuma ocorrência de `logActivity` em nenhum arquivo relacionado a `deals` |
| Comissões (`defaultCommissionPercent`, liquidação) | `src/app/app/configuracoes/comissao-actions.ts` não chama `logActivity` |
| Assinaturas / mudança de plano (`Subscription`) | Nenhuma ocorrência — mudanças de plano não deixam rastro de quem autorizou |
| Empreendimentos (`Development`) | `src/app/app/empreendimentos/actions.ts` tem `delete`/`deleteMany` sem nenhum `logActivity` associado — **uma exclusão real, hoje, sem nenhum rastro** |
| Características / Tipos de imóvel (`FeatureOption`, `PropertyTypeOption`) | Idem — `src/app/app/caracteristicas/actions.ts` e `tipos-imovel/actions.ts` excluem sem log |
| Permissões de papel (`RolePermission`) | Não encontrado nenhum `logActivity` associado a mudança de permissão de papel |

## 3. Lacunas identificadas (técnicas)

### 3.1 — Nenhuma edição captura valores antes/depois

Conferido diretamente no código (`src/app/app/imoveis/actions.ts:447-452`): a chamada de `logActivity` para `action: "updated"` de um `Property` **não inclui `payload`** — não há `preço anterior`/`preço novo`, nem nenhum outro campo. O mesmo padrão se repete em praticamente todos os `"updated"` do projeto. **Hoje é impossível responder "qual era o valor anterior?"** — a pergunta-exemplo #1 do proprietário, sem nenhuma mudança adicional além do que já existe.

### 3.2 — `logActivity()` nunca é transacional com a operação de negócio

```ts
// src/lib/activity-log.ts
export async function logActivity(params: {...}) {
  try {
    await prisma.activityLog.create({ data: {...} }); // sempre o client global, nunca um "tx"
  } catch (erro) {
    logger.error(...); // nunca relança — a operação principal nunca falha por causa do log
  }
}
```
A função não aceita um cliente de transação (`tx`) como parâmetro — mesmo quando chamada textualmente "dentro" de um bloco `prisma.$transaction(async (tx) => {...})`, ela sempre grava via o client global `prisma`, nunca via `tx`. **Isso é deliberado** (comentário no próprio arquivo: "nunca deve bloquear a operação principal") e é uma escolha de design legítima — mas tem um custo real: se a transação de negócio for revertida por qualquer motivo, o log já gravado **permanece**, descrevendo uma mudança que nunca aconteceu de fato. Inversamente, se `logActivity` falhar (ex: banco sob pressão), a mudança de negócio é confirmada **sem nenhum rastro**. Isso precisa de uma decisão de arquitetura explícita (ver seção 7 do plano).

### 3.3 — Nenhuma tela de leitura, em nenhum nível de permissão

Confirmado por busca ampla: zero arquivos fazem `prisma.activityLog.findMany`/`count` fora do próprio `logActivity()` (que só escreve). A funcionalidade descrita pelo proprietário como ausente ("o painel administrativo não apresenta uma área para consultar") está **tecnicamente correta** — mas a causa não é falta de dados, é falta de interface.

## 4. Mapeamento dos módulos (visão consolidada)

| Módulo | Create logado? | Update logado? | Delete existe? | Delete logado? | Soft delete? |
|---|---|---|---|---|---|
| Imóveis | Sim | Sim (sem payload) | Não (só `INACTIVE`, via `PropertyStatusHistory`) | Parcial (status, não preço) | Não |
| Clientes | Sim | Sim (sem payload) | **Não existe** | — | Não |
| Pipeline/Deals | Não | Não | Não investigado (fora do escopo sem log nenhum) | Não | Não |
| Agenda | Sim | Sim (ações específicas) | Sim (cancelamento, já logado como ação própria) | Sim | N/A |
| Usuários | Sim (convite) | Sim | Não (só suspensão/status) | Parcial | N/A |
| Configurações (branding) | N/A | Sim | N/A | N/A | N/A |
| Comissões | Não | Não | N/A | Não | N/A |
| Empreendimentos | Não | Não | **Sim, sem log** | **Não** | Não |
| Características/Tipos | Não | Não | **Sim, sem log** | **Não** | Não |
| Assinaturas/Planos | Não | Não | N/A | Não | N/A |
| Permissões de papel | Não | Não | N/A | Não | N/A |

**Prioridade recomendada** (cruzando "risco" × "esforço"): Empreendimentos e Características/Tipos primeiro (exclusões reais hoje sem nenhum rastro — risco direto, correção barata, só adicionar `logActivity` nos pontos já existentes); depois payload de Imóveis/Clientes (responde as perguntas financeiras do proprietário); Pipeline/Comissões/Assinaturas por último (maior esforço, menor frequência de uso hoje conforme contagens reais do backup: `deals=0`, `invoices=0`, `subscriptions=0` linhas em produção).

## 5. Proposta de arquitetura

**Não criar um novo modelo.** `ActivityLog` já é genérico o suficiente (entity/entityId/action/payload) para cobrir todos os módulos listados — a mesma tabela, os mesmos índices, o mesmo isolamento multi-tenant.

Mudanças técnicas propostas (conceituais, não implementadas):

1. **Payload estruturado e seletivo** — convenção nova, não mudança de schema: `payload: { campo: { antes: X, depois: Y } }`, só para campos de uma lista permitida por entidade (nunca o objeto inteiro). Isso responde às perguntas do proprietário sem expor dados desnecessários.
2. **Instrumentar os módulos faltantes** (seção 4) com `logActivity`, seguindo o padrão já estabelecido — sem necessidade de nenhum componente novo, só replicar o padrão existente em mais 6-8 pontos de código.
3. **Decisão de consistência transacional** (ver seção 7) — ou se aceita o comportamento atual (best-effort, documentado), ou se evolui `logActivity` para aceitar um `tx` opcional, usado nos fluxos onde a consistência é crítica (ex: exclusões, mudanças financeiras).
4. **Nova tela tenant-facing**, construída sobre os mesmos componentes genéricos já usados em `/platform/audit`: `DataTable`, `FiltroDropdown`, `interpretarPaginacao`, `interpretarFiltros`.

## 6. Modelagem conceitual (sem migration)

O modelo `ActivityLog` já cobre: id, createdAt (data/hora), organizationId (tenant), userId (ator), entity+entityId (registro afetado), action (tipo de operação), payload (JSON livre, seletivo). Campos do pedido original **não cobertos hoje** e que exigiriam avaliação separada, caso o proprietário queira:

| Campo pedido | Existe? | Observação |
|---|---|---|
| Nome histórico do usuário (caso ele seja removido depois) | Não | `userId` é `String?` sem relation obrigatória — se o `User` for excluído, o ID fica órfão mas sem nome. Precisaria desnormalizar o nome no momento da escrita, ou impedir exclusão física de usuários (já parece não existir, ver seção 2.6 — usuários hoje só são suspensos, não excluídos) |
| Origem (painel/API/rotina) | Não | Precisaria de um campo novo |
| ID de correlação de requisição | Não | O projeto não tem request-id/trace-id estabelecido hoje (fora do escopo deste diagnóstico confirmar se existe em outro lugar) |
| IP / sessão | Não | Levantaria questões de proteção de dados pessoais — não presumir que é desejável sem decisão explícita |
| RESTORE (tipo de operação) | N/A | Não existe função de restauração de registro individual hoje (só restauração de banco inteiro, Fase 127-A3) |

Nenhum desses é obrigatório para uma primeira versão — a proposta mínima viável usa só o que já existe no schema.

## 7. Estratégia de segurança multi-tenant

**Já resolvido pela infraestrutura existente, nada novo a construir**: `ActivityLog` está em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts:35`) — toda query automaticamente recebe `organizationId` injetado no `where`, fail-closed (lança exceção se não houver organização corrente), exatamente o mesmo mecanismo que já isola `Property`, `Person`, e todos os outros dados sensíveis do projeto.

- **Quem poderá visualizar**: a decidir — recomendo reaproveitar `PAPEIS_GESTAO_CONFIGURACOES` ou criar um novo conjunto específico (`PAPEIS_VISAO_AUDITORIA`), seguindo o padrão de `src/lib/authorization.ts` (que já define 8 conjuntos de papéis diferentes para funcionalidades distintas — auditoria provavelmente deveria ser restrita a `OWNER`/`ADMIN`, como `PAPEIS_FINANCEIRO`).
- **Quem poderá exportar**: decisão comercial/funcional pendente (seção 14).
- **Alterações sensíveis** (ex: mudança de permissão, exclusão): poderiam exigir um papel mais restrito que a visualização geral — a decidir.
- **Acesso da plataforma (Super Admin) à auditoria global**: já existe um caminho natural — `prismaPlatform` (o escape-valve cross-tenant já documentado e usado em `/platform/organizations`) poderia consultar `ActivityLog` de qualquer organização sem violar o isolamento, exatamente como já faz com outras tabelas tenant-scoped quando necessário.
- **Proteção contra alteração/exclusão dos próprios logs**: hoje não existe nenhuma Server Action que dê `update`/`delete` em `ActivityLog` — simplesmente não implementar nenhuma é a proteção mais simples e eficaz (não há UI nem API que precise disso).
- **Auditoria de ações de administrador**: o mecanismo é o mesmo — um `OWNER`/`ADMIN` que audita outro usuário gera, ele mesmo, uma entrada em `ActivityLog` (já que `userId` é sempre o ator da sessão atual, nunca o alvo da ação).

## 8. Proposta de interface

Reaproveitar integralmente o padrão de `src/app/platform/audit/page.tsx` + `columns.tsx`, adaptado:

- Rota sugerida: `/app/auditoria` (ou dentro de `/app/configuracoes`, como uma aba — a decidir conforme o menu atual).
- Filtros: período (novo — a tela de plataforma não tem, mas `interpretarFiltros`/`DataTable` já suportam esse tipo de extensão em outras telas do projeto), usuário (`OrganizationMember` da própria organização), módulo (`entity`), tipo de ação.
- Busca por ID do registro afetado (`entityId`) — já suportado pelo padrão de busca existente.
- Detalhe de uma linha: exibir o `payload` formatado (antes/depois), quando presente.
- Exportação: tecnicamente simples (a tabela já suporta paginação/filtro, bastaria um CSV/JSON dos resultados filtrados) — adequação comercial é decisão do proprietário (poderia ser um diferencial de plano PRO/PREMIUM, seguindo o padrão de `hasModule()` já usado em todo o catálogo de módulos comerciais).

Nenhum componente visual foi criado nesta etapa, conforme solicitado.

## 9. Performance e custos

**Volume real já conhecido** (Fase 127-A3, contagem direta do backup de produção restaurado): `activity_logs` tem **98 linhas** hoje, num sistema com 3 organizações, 11 imóveis, 3 usuários — estágio claramente pré-comercial. Não há, hoje, nenhum indício de problema de volume.

- **Índices**: já existem os dois mais importantes para as consultas típicas (`organizationId+createdAt` para listagem cronológica por tenant, `organizationId+entity+entityId` para "histórico deste registro específico"). Um índice adicional por `userId` só se tornaria necessário se o filtro "por usuário" for muito usado — avaliar depois de medir uso real.
- **Paginação**: já resolvida pelo componente `DataTable`/`interpretarPaginacao`, usado em todas as telas administrativas do projeto.
- **Armazenamento no Neon**: o custo de armazenamento de uma tabela de poucas linhas por operação (texto + JSON pequeno) é desprezível comparado a mídia (R2) ou mesmo às tabelas principais do domínio — não há dado real de tarifa do Neon por GB verificado nesta sessão (mesma lacuna já registrada em auditorias de custo anteriores do projeto).
- **Retenção**: **não definida arbitrariamente, conforme instrução** — três alternativas, cada uma com trade-off:
  1. **Retenção indefinida** (mais simples, mais honesto para auditoria — "o que aconteceu, aconteceu"; custo de armazenamento desprezível no volume atual e projetado).
  2. **Retenção por N meses/anos com purge automático** — reduz volume de longo prazo, mas contradiz o próprio propósito de uma trilha de auditoria (alguém poderia perguntar sobre algo além do prazo).
  3. **Arquivamento frio** (mover para armazenamento mais barato após X tempo, sem apagar) — meio-termo, mas exige infraestrutura adicional (fora do escopo atual do projeto).
  
  **Recomendação, não decisão**: retenção indefinida é a mais simples e coerente com o propósito declarado ("rastreabilidade"), dado o volume atual — revisitar só se o volume real crescer a ponto de justificar o custo de implementar purge/arquivamento.
- **Impacto nas transações de negócio**: desprezível no modelo atual (`logActivity` é uma escrita simples, fora da transação principal — ver seção 3.2 sobre o trade-off disso).

## 10. Riscos técnicos

1. **Mudar `logActivity` para aceitar `tx`** (se decidido) exige tocar ~40 pontos de chamada — risco de regressão, mitigável com testes (o projeto já tem cultura forte de teste de integração, ver `tests/integration/`).
2. **Dados sensíveis em `payload`**: sem uma lista explícita de campos permitidos por entidade, há risco de alguém adicionar um campo com dado pessoal sensível no futuro sem perceber — recomendação: lista de allowlist centralizada, revisada em code review, não uma blocklist (mais seguro por padrão).
3. **Esquecer novos módulos**: sem um teste automatizado que force "toda mutação relevante deve logar", a cobertura tende a ficar incompleta com o tempo (como já está hoje). Recomendação: um teste de integração que, para cada Server Action de criação/edição/exclusão de entidades de negócio, verifique a existência de pelo menos uma entrada correspondente em `ActivityLog`.
4. **Órfãos de `userId`**: usuários nunca são excluídos fisicamente hoje (seção 6) — risco baixo, mas não nulo, de referências futuras ficarem incompletas se isso mudar.

## 11. Plano de implementação por etapas

**Etapa A — Infraestrutura de auditoria** (baixo esforço — a maior parte já existe)
- Decisão sobre consistência transacional (seção 3.2) — documentar a escolha, implementar se necessário.
- Definir allowlist de campos auditáveis por entidade (mitiga risco 2).
- Nenhuma migration nova prevista (o modelo já existe e já é suficiente).

**Etapa B — Instrumentação** (esforço médio, mecânico)
- Adicionar `logActivity` nos módulos sem cobertura (seção 4): Empreendimentos, Características/Tipos (prioridade alta — exclusões sem rastro hoje), Pipeline/Deals, Comissões, Assinaturas, Permissões.
- Adicionar `payload` com antes/depois nas edições de Imóveis e Clientes (prioridade alta — responde diretamente às perguntas do proprietário).
- Esclarecer com o proprietário o que "excluir um cliente/imóvel" deveria significar, já que não existe hoje (seção 14).

**Etapa C — Interface administrativa** (esforço médio, maior parte copiada de `/platform/audit`)
- Tela `/app/auditoria` (ou equivalente), reaproveitando `DataTable`/`FiltroDropdown`.
- Definir papéis com acesso (seção 7).
- Decisão comercial sobre exportação/gating por plano.

**Etapa D — Validação**
- Testes multi-tenant: confirmar que uma organização nunca vê log de outra (já coberto estruturalmente pelo tenant-scoping, mas precisa de teste explícito, no padrão de `tests/integration/tenant-scoping-fase122.test.ts`).
- Teste de que cada mutação relevante gera exatamente uma entrada (não zero, não duplicada).
- Teste de performance só se o volume real justificar (não há indício disso hoje).

**Dependências e ordem**: B depende de uma decisão rápida sobre a pergunta da seção 14 (o que significa "excluir"); C depende de A (decisão de papéis) mas não de B (pode ser construída em paralelo, mostrando os dados que já existem). D é transversal, roda conforme cada etapa fecha.

**Esforço estimado, qualitativo** (sem compromisso de prazo, que não foi pedido): Etapa A — pequeno; Etapa B — médio (mecânico, mas espalhado por vários arquivos); Etapa C — médio (molde já existe); Etapa D — pequeno a médio, dependendo de quantos cenários novos de teste forem exigidos.

## 12. Critérios de aceite (propostos)

- Toda criação/edição/exclusão relevante nos módulos listados na seção 4 gera uma entrada em `ActivityLog`.
- Edições de campos financeiros/preço capturam valor anterior e novo.
- Um `OWNER`/`ADMIN` consegue filtrar por período, usuário, módulo e tipo de ação, e ver o detalhe de uma alteração.
- Uma organização nunca consegue ver (nem por manipulação de URL) o log de outra — testado explicitamente.
- Nenhum dado sensível (senha, token, cookie, documento completo) aparece em nenhum `payload`.

## 13. Decisões pendentes do proprietário

### A. Comercial
- A tela de auditoria é um recurso de todos os planos, ou um diferencial de PRO/PREMIUM (seguindo o padrão de `hasModule()` já usado no catálogo)?
- Exportação de relatórios é um recurso a oferecer já na primeira versão, ou fica para depois?

### B. Funcional
- **O que significa "excluir um cliente" e "excluir um imóvel"** — já que nenhuma das duas operações existe hoje? Três caminhos possíveis, cada um com escopo de trabalho muito diferente:
  1. Manter como está (sem exclusão real) e auditar só o que já existe (status `INACTIVE` de imóvel).
  2. Implementar exclusão real (ou soft delete) como uma funcionalidade nova — fora do escopo de "só auditoria", exigiria sua própria análise e aprovação.
  3. Esclarecer que o exemplo era ilustrativo/futuro, e focar a auditoria no que já existe (edições e status).
- Quais papéis (`OWNER`/`ADMIN`/outros) podem ver a tela de auditoria? Há diferenciação entre "ver tudo" e "ver alterações sensíveis" (ex: mudança de permissão)?
- Retenção: indefinida (recomendado) ou com prazo definido?

### C. Técnico (para aprovação, não para execução automática)
- Mudar `logActivity` para suportar transação (`tx`) opcional, ou aceitar o modelo atual best-effort documentado?
- Allowlist de campos auditáveis por entidade — quem define a lista inicial (eu posso propor, mas authoria final é do proprietário/produto)?

---

## RESULTADO ESPERADO — RESPOSTAS DIRETAS

**A. O EasyMob já possui logs de auditoria?**
**PARCIALMENTE.** A infraestrutura (modelo, serviço, isolamento multi-tenant) existe e está ativa em produção desde antes desta demanda — mas é 100% escrita, 0% lida. Não há como alguém, hoje, consultar esses dados — nem o proprietário de uma imobiliária, nem o Super Admin da plataforma (que já tem sua própria auditoria equivalente, `PlatformAuditLog`, com UI funcional).

**B. O que já funciona?**
Escrita de eventos para Imóveis, Clientes, Usuários, Agenda, Configurações/Branding, Captação de leads, Upload de mídia, Login, Criação de organização — com isolamento multi-tenant automático e à prova de falhas (nunca bloqueia a operação principal).

**C. O que está faltando?**
Uma tela de leitura (a lacuna principal); payload com valores antes/depois nas edições; cobertura para Pipeline, Comissões, Assinaturas, Empreendimentos, Características/Tipos (estes dois últimos têm exclusões reais, hoje, sem nenhum rastro); e um esclarecimento sobre a funcionalidade de exclusão de clientes/imóveis, que não existe.

**D. Qual é a melhor arquitetura?**
Reaproveitar o modelo `ActivityLog` existente (sem migration nova), reaproveitar o padrão de tela já construído em `/platform/audit` (sem componente novo), e fechar as lacunas de instrumentação de forma incremental, módulo por módulo.

**E. Qual será o impacto?**
Complexidade baixa a média — a maior parte da infraestrutura já existe e já está em produção. Custo de armazenamento desprezível no volume atual (98 linhas). O maior esforço é mecânico (instrumentar módulos faltantes), não arquitetural.

**F. Como implementar?**
Quatro etapas incrementais (seção 11), começando pelas exclusões sem rastro (Empreendimentos, Características/Tipos — risco real, correção barata), seguido de payload nas edições financeiras, depois a tela, com testes multi-tenant em paralelo.

**G. O que depende da sua aprovação?**
Tudo listado na seção 13 — especialmente o esclarecimento sobre exclusão de clientes/imóveis (que muda o escopo real do trabalho), a decisão de papéis com acesso, a decisão comercial de gating por plano, e a decisão técnica sobre consistência transacional.
