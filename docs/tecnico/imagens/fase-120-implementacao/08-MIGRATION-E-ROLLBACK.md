# 08 — Migration e estratégia de rollback

## Migration

- `prisma/migrations/20261013011821_add_platform_storage_cleanup_task/migration.sql` — aditiva: 2 `CREATE TYPE` (enums `PlatformStorageCleanupTaskType`, `PlatformStorageCleanupTaskStatus`), 1 `CREATE TABLE` (`platform_storage_cleanup_tasks`), 3 `CREATE INDEX`. **Nenhum `ALTER TABLE` em tabela existente, nenhum `DROP`.**
- Aplicada via `npx prisma migrate dev` contra o banco **local** de desenvolvimento (`imoveis` em `localhost:5432`, confirmado pela saída do comando) e replicada ao banco de testes via `npx tsx scripts/prepare-test-db.ts`.
- **Não aplicada em produção.** Aplicar em produção exige o mesmo procedimento já documentado (`scripts/migrate-deploy.ts`, job de pre-deploy da DigitalOcean) — fora do escopo autorizado desta fase.

## Rollback da migration (se necessário antes de produção)

Reversível de forma simples: `DROP TABLE platform_storage_cleanup_tasks; DROP TYPE "PlatformStorageCleanupTaskStatus"; DROP TYPE "PlatformStorageCleanupTaskType";` — nenhuma outra tabela depende desta (sem FK de entrada), nenhum dado de produção seria perdido por reverter (a tabela em si só existiria depois de aplicada, e só teria conteúdo depois de organizações serem excluídas).

## Rollback de cada etapa de código (sem reverter a migration)

### 120-A (validação de URL, cabeçalhos)
Remover a chamada a `validarUrlMidiaOrganizacao` em `parseMidias` e os campos `CacheControl`/`ContentDisposition` do `PutObjectCommand` — reverte ao comportamento anterior. Nenhum dado já persistido precisa de ajuste (URLs já válidas continuam válidas; objetos já enviados sem os novos cabeçalhos continuam servíveis, só sem eles).

### 120-B (compressão)
Desativar a ramificação `if (pasta === "imoveis") { ... }` na rota de upload — reverte a NOVOS uploads para o comportamento sem compressão. **Fotos já enviadas em WebP continuam servíveis normalmente** (WebP já era um formato aceito pela allowlist de leitura antes desta fase) — não há necessidade de reverter dado já armazenado.

### 120-C (remoção real ao substituir foto)
Remover a chamada a `removerObjetosR2` depois da transação em `atualizarImovel` — reverte ao comportamento anterior (só remove do banco). Nenhum dado já removido do R2 pode ser restaurado por este rollback — mas isso é consistente com a doutrina já existente do produto (o próprio `limparMidiasOrfas`, pré-existente, já tinha esse mesmo caráter irreversível).

### 120-D (outbox de limpeza)
Mais delicado: se revertido DEPOIS de alguma organização real já ter sido excluída com uma tarefa criada, a tarefa continua na tabela (`PENDENTE`, nunca processada) — não é destrutivo manter isso. Reverter a criação da tarefa em `deletarOrganization` antes de qualquer exclusão real acontecer é seguro e trivial (remove o bloco `tx.platformStorageCleanupTask.create(...)`).
**Processamento real** (`processarTarefaLimpeza`) nunca foi executado contra dado real nesta fase — não há nada para reverter nesse sentido.

### 120-E (legado/órfãos)
Infraestrutura inteiramente gated/read-only — reverter é só remover os arquivos novos, sem efeito em nenhum dado.

## Limitações de reversibilidade — ditas explicitamente, nunca presumidas

- **Exclusão real de objetos R2 (quando um dia for executada via `processarTarefaLimpeza` ou uma futura limpeza de órfãos) É IRREVERSÍVEL.** Não existe backup de mídia separado identificado em nenhuma fase anterior deste produto. A retenção de 30 dias (Etapa D) é uma janela de segurança para ERRO ADMINISTRATIVO (cancelar antes de processar), não uma garantia de recuperação depois de processado.
- **Reencode retroativo de fotos legadas (Etapa E, nunca executado)**, se um dia for implementado, precisaria preservar o objeto original até confirmar que o novo está correto antes de apagar o antigo — esse desenho específico fica para a fase de implementação real, quando/se for aprovada (ver `docs/tecnico/imagens/fase-120/03-PRIVACIDADE-EXIF-GPS.md`).

## Etapas que exigem backup/inventário prévio antes de qualquer execução real

1. Antes de habilitar `LEGACY_REPROCESS_ENABLED=true` em qualquer ambiente: precisa existir o desenho completo do reencode retroativo (não existe ainda — é só um gate que recusa).
2. Antes de processar qualquer `PlatformStorageCleanupTask` real em produção: o dry-run (`visualizarTarefaLimpeza`) deve ser executado e revisado por um humano primeiro — a UI já força isso ao exibir o relatório antes do formulário de confirmação, mas não impede tecnicamente pular a revisão.
3. Antes de qualquer exclusão em lote de órfãos (não implementada): exigiria, no mínimo, a quarentena proposta e não construída em `docs/tecnico/imagens/fase-120/05-CICLO-VIDA-R2.md`.
