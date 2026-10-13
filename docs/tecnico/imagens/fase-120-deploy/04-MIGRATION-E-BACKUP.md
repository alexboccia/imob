# 04 — Migration e backup — por que a migration NÃO foi aplicada em produção

## Decisão desta auditoria: migration excluída da publicação

A migration `20261013011821_add_platform_storage_cleanup_task` (Etapa 120-D) **não foi aplicada em produção e não foi incluída no commit/push desta fase.** Ela permanece no disco local (não comitada), pronta para uma fase futura.

## Motivo — critério bloqueante do briefing, não contornado

> "Se não houver mecanismo de backup e recuperação comprovadamente utilizável, não executar a migration nem o deploy dependente dela."

Verificação feita nesta auditoria, não presumida:
- `docs/operations/database-restore-runbook.md`, seção 1, tabela de plano/PITR da Neon — **todos os campos continuam marcados "A CONFIRMAR"**, incluindo "Plano Neon", "PITR disponível?", "Janela de PITR", "Responsável pela conta Neon". Esse documento é explícito: esta sessão não tem acesso ao painel da Neon nem a uma `NEON_API_KEY`/`neonctl` configurados — confirmado novamente nesta auditoria (nenhuma credencial desse tipo está disponível neste ambiente).
- Não há, em nenhum documento deste projeto, confirmação de que algum backup/snapshot manual foi de fato tomado antes de qualquer migration anterior.
- O mecanismo de deploy (`scripts/migrate-deploy.ts` via Job `imob2`, `docs/operations/deployment-runbook.md`) impede a aplicação **parcial** de uma migration com falha (se o `prisma migrate deploy` falhar, a versão nova não entra em serviço) — isso protege contra uma migration que falha no meio, mas **não é um mecanismo de restauração de dados**, que é o que o critério do briefing exige.

## Por que isto não bloqueia a publicação de 120-A/B/C

A migration só é necessária para a Etapa 120-D (tabela `PlatformStorageCleanupTask`). Nenhum código das Etapas 120-A, 120-B ou 120-C depende de qualquer alteração de schema — confirmado por `git diff` do escopo publicado: `prisma/schema.prisma` não está entre os arquivos modificados nesta publicação. Excluir a migration, portanto, não impede publicar o resto.

## Nota técnica sobre o risco real desta migration específica (contexto, não uma forma de contornar o critério)

Esta migration é puramente aditiva — 2 `CREATE TYPE`, 1 `CREATE TABLE`, 3 `CREATE INDEX`, nenhum `ALTER`/`DROP` em tabela existente (confirmado por leitura do SQL gerado, `docs/tecnico/imagens/fase-120-implementacao/08-MIGRATION-E-ROLLBACK.md`). Mesmo sem backup/PITR confirmado, o pior cenário realista desta migration específica é "a tabela precisa ser removida com um `DROP TABLE` simples", porque nenhum dado existente é tocado. Isto é dito aqui como contexto de risco, **não como justificativa para contornar o critério explícito do briefing** — a decisão desta auditoria é cumprir a letra do critério (não aplicar sem backup comprovadamente utilizável), não reinterpretá-lo com base na baixa severidade aparente do caso concreto.

## O que seria necessário para desbloquear isto numa fase futura

1. Acesso ao painel Neon (ou `NEON_API_KEY`) para preencher a tabela de `docs/operations/database-restore-runbook.md` §1 com os valores reais (plano, PITR, janela).
2. Se a janela de PITR existir e for confiável, ou se um snapshot manual puder ser tomado antes da migration, esse é o "mecanismo comprovadamente utilizável" que o critério exige.
3. Só então aplicar a migration (via o mesmo pipeline automático de push→deploy já existente) e publicar o código de 120-D/120-E que depende dela.

## Confirmação

Nenhum `prisma db push`, `prisma migrate reset`, nem alteração manual de schema foi executado contra qualquer banco de produção nesta sessão. Nenhum backup foi testado de forma destrutiva contra produção. A única aplicação da migration foi local (`npx prisma migrate dev`, banco `imoveis` em `localhost:5432`) e no banco de teste automatizado — nunca em produção.
