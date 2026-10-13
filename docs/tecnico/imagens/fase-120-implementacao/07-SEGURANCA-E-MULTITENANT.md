# 07 — Segurança e isolamento multi-tenant

## Achados da Fase 119/120 e seu status após esta implementação

| Achado | Severidade original | Status |
|---|---|---|
| EXIF/GPS preservado em fotos de imóvel | Alto | **Resolvido** (Etapa 120-B) — comprovado por teste automatizado (embute EXIF real, confirma ausência na saída) |
| Mídia de imóvel sem validação de origem de URL | Médio | **Resolvido** (Etapa 120-A) — `validarUrlMidiaOrganizacao` aplicada a FOTO/PLANTA |
| Exclusão de organização nunca limpa R2 (órfão permanente) | Alto (operacional) | **Resolvido estruturalmente** (Etapa 120-D) — outbox captura o prefixo antes da exclusão; execução real da limpeza continua manual e protegida por retenção de 30 dias |
| Substituição/remoção de foto nunca limpa o R2 | Médio | **Resolvido** (Etapa 120-C) |
| Sem `CacheControl`/`ContentDisposition` explícitos | Baixo | **Resolvido** (Etapa 120-A) |
| PDF com JS embutido servido inline | Médio | **Mitigado** (Etapa 120-A, `ContentDisposition: attachment` para materiais) — não elimina a possibilidade de upload de PDF malicioso (ainda sem decodificação profunda de PDF), só reduz a superfície de execução automática |
| Rate limit de upload fail-open sem Upstash | Baixo-Médio | **Mantido como estava, por decisão** (`docs/tecnico/imagens/fase-120/04-SEGURANCA-MULTITENANT.md` §4.4) — o limite de plano (`PHOTOS_PER_PROPERTY`) nunca é fail-open e já contém abuso de volume |
| DRAFT/INACTIVE sem controle de acesso próprio no storage | Baixo | **Não endereçado** — característica arquitetural aceita (bucket público, segurança por segredo de chave UUID), não uma falha de permissão |
| Sem decodificação profunda fora do Hero | Médio | **Parcialmente resolvido** — fotos de imóvel agora são decodificadas de verdade pelo `sharp` (Etapa B), o que já rejeita a maioria dos arquivos não-imagem reais; materiais (PDF) continuam só com checagem de magic bytes |

## Isolamento multi-tenant — verificação específica desta implementação

- **Upload**: `organizationId` sempre da sessão, nunca do cliente — inalterado.
- **Validação de URL de mídia**: `validarUrlMidiaOrganizacao` compara `origin` + prefixo exato `{organizationId}/imoveis/` — testado com cenário adversarial (URL de outra organização é descartada, `src/lib/property-mapper.test.ts`).
- **Remoção de objeto R2**: `removerObjetosR2` rejeita qualquer chave fora do prefixo da organização chamadora, mesmo que a lista de URLs recebida contenha uma chave de outra organização por engano de um caller futuro — testado explicitamente (`src/lib/r2-media.test.ts`, `tests/integration/imovel-remocao-r2.test.ts`).
- **Tarefas de limpeza de storage**: `PlatformStorageCleanupTask.idempotencyKey` único por organização; processamento sempre restrito ao `prefix` daquela tarefa específica, nunca a um prefixo arbitrário informado por quem chama.
- **Inventário de órfãos**: usa `prismaPlatform` deliberadamente (client sem a extensão de tenant-scoping) porque a operação É cross-tenant por natureza (Super Admin revisando todo o bucket) — esse uso está documentado no próprio código como a razão de existir desse client (`src/lib/prisma.ts`, comentário já existente desde fases anteriores). Um bug real de uso do client errado (tentou `prisma.media.findMany` sem organizationId, que é tenant-scoped e fail-closed) foi encontrado pelo próprio teste e corrigido antes de qualquer commit.
- **Reprocessamento de fotos legadas**: escopo sempre de uma organização por vez, nunca em lote cross-tenant — e, nesta rodada, sempre recusado antes de chegar a tocar em qualquer dado.

## Permissões — nenhuma ampliada

Todas as novas Server Actions (`visualizarTarefaLimpeza`, `processarTarefaLimpeza`, `inventariarFotosLegadas`, `reprocessarFotosLegadas`, `inventariarObjetosOrfaos`) exigem `requirePlatformOperator()` + `temPapelPlataforma(role, PAPEIS_PLATAFORMA_TUDO)` — restrito a `SUPER_ADMIN`, mesmo padrão já usado por `deletarOrganization` e pelas demais ações administrativas de risco do produto. Testado explicitamente que um operador `PLATFORM_ADMIN` (sem esse papel) é recusado (`tests/integration/storage-cleanup.test.ts`).
