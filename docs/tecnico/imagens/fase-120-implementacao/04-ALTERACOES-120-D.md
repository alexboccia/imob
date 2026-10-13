# 04 — Etapa 120-D: Outbox de limpeza e exclusão de organizações

## Status: IMPLEMENTADO e TESTADO LOCALMENTE (migration criada e aplicada só em ambiente local/teste, nunca em produção)

## Modelo `PlatformStorageCleanupTask`

Adicionado em `prisma/schema.prisma`, migration aditiva `prisma/migrations/20261013011821_add_platform_storage_cleanup_task/migration.sql` (duas `CREATE TYPE`, uma `CREATE TABLE`, três `CREATE INDEX` — **nenhuma alteração em tabela existente**, confirmado por leitura do SQL gerado).

Campos relevantes: `organizationId`/`organizationSlug` (soltos, sem `@relation` — mesma decisão já usada por `PlatformAuditLog.organizationId`, documentada no schema: a tabela precisa sobreviver à exclusão da organização que ela mesma documenta), `prefix` (sempre `{organizationId}/`), `status` (`PENDENTE`/`EM_PROCESSAMENTO`/`CONCLUIDA`/`FALHOU`), `requestedAt`/`eligibleAt` (+30 dias, aprovado), `attempts`/`lastError`, `idempotencyKey` (`UNIQUE`, formato `organization-deleted:{organizationId}`).

Aplicada via `npx prisma migrate dev` contra o banco **local** (`imoveis`, `localhost:5432` — confirmado pela saída do comando) e replicada ao banco de teste via `npx tsx scripts/prepare-test-db.ts`. **Nunca executada contra produção.**

## Captura do prefixo antes da exclusão

`src/app/platform/organizations/[id]/actions.ts`, `deletarOrganization`: a criação da `PlatformStorageCleanupTask` é a **primeira operação dentro da mesma transação** (`prismaPlatform.$transaction`) que depois apaga a organização. Se esse `create` falhar (ex.: `idempotencyKey` já existe — uma tarefa já foi criada para esta organização), **a transação inteira é revertida e nada é apagado** — nunca um fluxo destrutivo que segue sem a tarefa de limpeza correspondente.

## Processamento manual (Super Admin)

`src/app/platform/storage-cleanup/actions.ts`:
- `visualizarTarefaLimpeza(taskId)` — dry-run, só `ListObjectsV2`, nunca exclusão, disponível mesmo antes da elegibilidade.
- `processarTarefaLimpeza(taskId, _prevState, formData)` — a única função que de fato apaga: exige papel Super Admin (`PAPEIS_PLATAFORMA_TUDO`), confirmação textual exata (slug da organização, mesmo padrão já usado por `deletarOrganization`), retenção de 30 dias (`garantirElegibilidade`, nunca contornável), transição atômica `PENDENTE|FALHOU → EM_PROCESSAMENTO` via `updateMany` condicionado ao status atual (proteção de concorrência: duas chamadas simultâneas nunca processam a mesma tarefa em paralelo), relistagem do prefixo no momento do processamento (idempotência real, não um dry-run antigo), registro em `PlatformAuditLog` (`STORAGE_CLEANUP_TASK_PROCESSED`).

UI: `src/app/platform/storage-cleanup/page.tsx` + `TarefaLimpezaCard.tsx` (Client Component) — lista tarefas, botão de dry-run, formulário de confirmação só visível quando elegível. Link adicionado à navegação (`src/app/platform/layout.tsx`).

## Testes executados (resultados reais)

`tests/integration/storage-cleanup.test.ts` (novo, 9 testes, **todos passaram**):
- Excluir organização cria exatamente uma tarefa `PENDENTE`, com `prefix`/`organizationSlug` corretos e `eligibleAt` em ~30 dias — e confirma que a organização de fato não existe mais no banco.
- Dry-run nunca apaga nada, mesmo antes da elegibilidade.
- Processamento bloqueado antes dos 30 dias, mesmo com confirmação correta.
- Confirmação incorreta não processa.
- Papel sem Super Admin não processa.
- Elegível + confirmação correta remove os objetos de fato (confirmado via mock do SDK) e marca `CONCLUIDA`.
- Reprocessar tarefa `CONCLUIDA` é bloqueado.
- **Concorrência**: tarefa já `EM_PROCESSAMENTO` não é "roubada" por outra chamada simultânea.
- Tarefa `FALHOU` pode ser reprocessada com sucesso (retentativa).

## Bloqueio operacional confirmado

Nenhuma chamada real de exclusão foi feita durante o desenvolvimento desta fase fora dos testes com SDK mockado — confirmado: toda interação com `@aws-sdk/client-s3` nos testes passa por um mock que nunca toca o Cloudflare real (mesmo padrão já estabelecido em `tests/integration/manutencao-limpar-midias.test.ts`). O botão "Apagar definitivamente" na UI só fica disponível quando `eligibleAt` já passou — como nenhuma tarefa real existe ainda em nenhum ambiente real, **nenhuma remoção de dado real de produção é possível a partir desta implementação, nesta rodada**.
