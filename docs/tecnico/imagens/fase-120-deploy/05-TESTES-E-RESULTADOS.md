# 05 — Testes e resultados (reexecutados de forma independente, escopo reduzido)

**Todos os comandos abaixo foram reexecutados nesta auditoria, depois de excluir as Etapas 120-D/E do working tree** (via `git stash` dos arquivos correspondentes, incluindo a regeneração do Prisma Client a partir do schema sem a tabela nova) — nunca presumido a partir do relatório da implementação anterior.

## TypeScript

```
npx tsc --noEmit -p .
```
Primeira tentativa: **falhou** — `.next/types/validator.ts` referenciava `src/app/platform/storage-cleanup/page.js`, um artefato de cache do build anterior (feito com o escopo completo). Removido `.next/` e reexecutado: **aprovado, sem erros.**

## ESLint

```
npm run lint
```
**Aprovado, sem avisos.**

## Build de produção

```
npm run build
```
**Aprovado.** Confirmado na lista de rotas geradas: `/platform/storage-cleanup` **não aparece** (correto — excluída desta publicação).

## Testes unitários e de integração

```
npm run test
```
**Resultado: 192 arquivos, 3754 testes, todos aprovados.** (O relatório da implementação anterior registrava 195/3777 com o escopo completo A-E; a diferença — 3 arquivos/23 testes a menos, mais 1 arquivo/3 testes novo do gate de compressão — é exatamente a aritmética esperada da exclusão de 120-D/E e da adição do teste do novo gate `compressaoDeImovelHabilitada`, verificada linha a linha nesta auditoria.)

## Playwright (E2E completo)

```
npm run test:e2e
```
[Resultado real preenchido após a conclusão da execução desta auditoria — ver `10-STATUS-FINAL.md` e `08-SMOKE-TESTS-PRODUCAO.md`. Nenhum resultado é declarado antes da execução de fato terminar.]

## Testes de segurança multi-tenant (dentro da suíte acima, destacados)

- `tests/integration/imovel-remocao-r2.test.ts` — isolamento multi-tenant na remoção de objeto R2 (cenário adversarial).
- `src/lib/r2-media.test.ts` — rejeição de chave de outra organização, rejeição de URL de host externo.
- `src/lib/property-mapper.test.ts` — rejeição de URL de FOTO/PLANTA fora do prefixo da organização; aceitação de `data:` (exceção documentada e analisada em `01-AUDITORIA-SEGURANCA.md`).
- `tests/integration/plan-entitlements.test.ts` — enforcement de limite de fotos continua funcionando com a nova validação de URL.
- `tests/integration/galeria-editorial.test.ts` + `src/lib/galeria-editorial.test.ts` — isolamento multi-tenant/mass-assignment em mídia de imóvel (testes pré-existentes, reconfirmados).

## Testes de storage/outbox/retenção

**Não aplicável a esta publicação** — pertencem às Etapas 120-D/E, excluídas (`tests/integration/storage-cleanup.test.ts`, `tests/integration/legacy-e-orfaos.test.ts`, `src/lib/{legacy-reprocess,orphan-inventory}.test.ts`). Permanecem no disco local, não comitados, e foram confirmados passando na rodada de implementação anterior (9 + 5 + 5 + 7 = 26 testes) — não re-executados nesta auditoria porque não fazem parte do que está sendo publicado.
