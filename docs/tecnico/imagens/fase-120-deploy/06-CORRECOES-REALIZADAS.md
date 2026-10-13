# 06 — Correções realizadas nesta auditoria

## 1. Escopo reduzido — exclusão das Etapas 120-D e 120-E do commit

- **Causa raiz**: dependência de migration de schema sem backup/recuperação de produção comprovadamente utilizável (ver `04-MIGRATION-E-BACKUP.md`).
- **Arquivos revertidos ao estado original** (sem a mudança da Fase 120): `src/app/platform/organizations/[id]/actions.ts` (removido o bloco que criava `PlatformStorageCleanupTask` dentro da transação de exclusão de organização), `src/app/platform/layout.tsx` (removido o link de navegação para `/platform/storage-cleanup`).
- **Arquivos mantidos no disco, não comitados**: `prisma/schema.prisma` (modificação revertida apenas para fins de build/teste desta auditoria, depois restaurada — ver nota abaixo), migration, `src/app/platform/storage-cleanup/`, `src/lib/{storage-cleanup,legacy-reprocess,orphan-inventory}.ts` (+testes), `tests/integration/{storage-cleanup,legacy-e-orfaos}.test.ts`.
- **Teste de regressão**: build de produção reexecutado confirmando que `/platform/storage-cleanup` não aparece mais na lista de rotas; suíte completa reexecutada (192 arquivos/3754 testes) sem o escopo excluído.
- **Efeitos colaterais verificados**: nenhum arquivo do escopo publicado (120-A/B/C) importa ou depende de qualquer arquivo das Etapas 120-D/E — confirmado por busca textual antes de excluir.

## 2. Gate de ativação para a compressão (120-B)

- **Causa raiz**: critério bloqueante do briefing — validação visual com fotografias reais autorizadas não pôde ser realizada nesta sessão (sem amostras disponíveis).
- **Correção**: nova função `compressaoDeImovelHabilitada()` (`src/lib/property-image-limits.ts`), gate por variável de ambiente `PROPERTY_IMAGE_COMPRESSION_ENABLED` (comparação exata com `"true"`, mesmo padrão já usado em `LEGACY_REPROCESS_ENABLED`). Aplicado em `src/app/api/admin/upload/route.ts`, condicionando a ramificação de compressão.
- **Teste de regressão**: novo `src/lib/property-image-limits.test.ts` (3 testes) confirmando que o gate fica desligado por padrão, desligado para qualquer valor que não seja exatamente `"true"`, e ligado só com esse valor exato.
- **Efeito**: upload de foto de imóvel em produção permanece, a partir deste deploy, **idêntico ao comportamento anterior a toda a Fase 120** — nenhuma mudança de comportamento visível até a variável ser definida manualmente, depois da validação visual.

## 3. Nota sobre reversões feitas e desfeitas durante a própria auditoria

Durante a verificação do escopo reduzido, o schema (`prisma/schema.prisma`) e o Prisma Client foram temporariamente revertidos (via `git stash` dos arquivos da Etapa 120-D/E) para confirmar que o build/testes do escopo reduzido funcionam de forma independente — e depois restaurados (`git stash pop`) ao estado de trabalho local completo, já que o trabalho das Etapas D/E continua válido e preservado para uma fase futura, só não faz parte deste commit.

## O que NÃO foi corrigido (fora do escopo desta auditoria, por não ser um problema introduzido pela Fase 120)

- Rate limiting de upload fail-open sem Upstash — decisão já documentada e revalidada, não alterada.
- `limparMidiasOrfas` (pré-existente) não foi refatorada para reaproveitar `r2-media.ts` — por prudência, já registrado como melhoria futura na implementação anterior.
- Lacuna de validação de conteúdo profundo em PDFs (`materiais`) — mitigada parcialmente por `ContentDisposition: attachment`, não eliminada — já registrado, fora do escopo desta publicação (nenhuma nova exposição introduzida).
