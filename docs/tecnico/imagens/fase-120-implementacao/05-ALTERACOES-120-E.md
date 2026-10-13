# 05 — Etapa 120-E: Imagens legadas, inventário de órfãos e monitoramento

## Status: INFRAESTRUTURA IMPLEMENTADA E TESTADA — execução real continua DESLIGADA por padrão

## Reprocessamento de fotos legadas — infraestrutura preparada, nunca executável nesta rodada

`src/lib/legacy-reprocess.ts`:
- `reprocessamentoLegadoHabilitado()` — `true` somente se `process.env.LEGACY_REPROCESS_ENABLED === "true"` (comparação exata; qualquer outro valor, incluindo `"1"`/`"yes"`, é tratado como desabilitado — confirmado por teste). **Esta variável não foi definida em nenhum ambiente nesta sessão** — a função retorna `false` em qualquer execução real.
- `classificarMidiaPorExtensao(urls)` — heurística de inventário (pela extensão `.webp` vs. outras), explicitamente documentada como aproximação, nunca como prova de que uma foto já passou pelo pipeline novo.

`src/app/platform/storage-cleanup/legacy-e-orfaos-actions.ts`:
- `inventariarFotosLegadas(organizationId)` — sempre disponível, só leitura, Super Admin apenas.
- `reprocessarFotosLegadas(organizationId, confirmacao)` — **primeira checagem é o gate acima**; se desabilitado (sempre, nesta sessão), recusa com mensagem explícita, antes de qualquer outra validação. Mesmo com o gate manualmente habilitado em teste E confirmação correta, a função recusa (ponto de extensão deliberadamente não implementado — reencode/substituição real de foto legada é tratado como uma decisão de produto própria, fora do escopo autorizado desta rodada).

## Inventário de objetos órfãos (todo o bucket) — só leitura

`src/lib/orphan-inventory.ts`:
- `classificarOrfaos(objetos, organizacoesExistentes, chavesEmUso, agora)` — pura, testável sem I/O: classifica em **alta confiança** (prefixo não corresponde a nenhuma organização existente) e **confiança média** (organização existe, sem referência em `Media.url`, com mais de 24h — mesmo limiar de `limparMidiasOrfas`). Chave fora do padrão esperado (sem `/`) nunca é classificada automaticamente. Objeto referenciado por uma `Media` real nunca é candidato, em nenhuma confiança.
- `inventariarObjetosOrfaos()` (Server Action) — varre `ListObjectsV2` em todo o bucket, compara contra `prismaPlatform.organization`/`prismaPlatform.media` (uso deliberado do client sem a extensão de tenant-scoping — comparar o bucket inteiro contra toda a base é exatamente a operação cross-tenant legítima que esse client existe para resolver; uma consulta sem organizationId usando o client comum teria sido rejeitada fail-closed pela extensão, o que de fato aconteceu no primeiro teste desta função e foi corrigido). Registra a execução em `PlatformAuditLog` (`STORAGE_ORPHAN_INVENTORY_RUN`). **Nunca chama exclusão.**

## Dry-run e quarentena

Dry-run: implementado e é o único modo disponível (`inventariarObjetosOrfaos`/`visualizarTarefaLimpeza` da Etapa D). **Quarentena (mover objetos candidatos para um prefixo separado antes da remoção definitiva) NÃO foi implementada** — ficou registrada como proposta em `docs/tecnico/imagens/fase-120/05-CICLO-VIDA-R2.md`, não construída nesta rodada por exigir uma operação de cópia/move no R2 que esta fase não foi autorizada a executar de verdade contra nenhum ambiente.

## Monitoramento

`src/app/api/admin/upload/route.ts` — ao processar uma foto de imóvel (Etapa B), registra via `logger.info` (sem dado sensível: nunca URL/chave/nome de arquivo): `tamanhoOriginalBytes`, `tamanhoProcessadoBytes`, `reducaoPercentual`, `tempoProcessamentoMs`, `organizationId`. Falha de processamento é logada via `logger.warn` separadamente. Erros de remoção no R2 (`r2-media.ts`) já eram logados via `logger.error` com contagem de chaves no lote, nunca a chave em si.

**Não implementado nesta fase**: um painel/dashboard agregando essas métricas (tarefas pendentes/elegíveis, falhas de limpeza, armazenamento estimado por organização) — os dados ficam disponíveis via log estruturado e via consulta direta a `PlatformStorageCleanupTask`/`PlatformAuditLog`, mas não há uma tela dedicada agregando isso. Registrado como melhoria futura, não bloqueante.

## Testes executados (resultados reais)

- `src/lib/legacy-reprocess.test.ts` (5 testes) e `src/lib/orphan-inventory.test.ts` (7 testes) — unitários, puros, **todos passaram**.
- `tests/integration/legacy-e-orfaos.test.ts` (5 testes) — **todos passaram**, incluindo a confirmação de que `reprocessarFotosLegadas` recusa mesmo com `LEGACY_REPROCESS_ENABLED=true` e confirmação correta (ponto de extensão não implementado), e a classificação correta de órfãos de alta/média confiança contra dados reais do banco de teste (com um bug real de escopo de tenant encontrado e corrigido durante esta própria etapa — ver `06-TESTES-E-EVIDENCIAS.md`).
