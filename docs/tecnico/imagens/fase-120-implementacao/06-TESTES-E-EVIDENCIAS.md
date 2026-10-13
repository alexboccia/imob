# 06 — Testes e evidências

Todos os comandos abaixo foram de fato executados nesta sessão, contra o ambiente local (banco `imoveis_test`, `@aws-sdk/client-s3` sempre mockado nos testes automatizados — nunca chama o Cloudflare real).

## TypeScript

```
npx tsc --noEmit -p .
```
**Resultado: aprovado, sem erros**, após cada etapa de implementação (verificado repetidamente, não só ao final).

## ESLint

```
npm run lint
```
**Resultado: aprovado, sem avisos**, em todos os arquivos novos/alterados.

## Testes unitários e de integração

```
npm run test
```
**Resultado real, última execução completa**: `Test Files 195 passed (195)` / `Tests 3776 passed (3776)`.

Novos arquivos de teste desta fase (todos incluídos no total acima):
- `src/lib/property-image-processar.test.ts` — 12 testes (compressão, redimensionamento, orientação, remoção de EXIF/GPS comprovada por teste real).
- `src/lib/r2-media.test.ts` — 10 testes (extração de chave, isolamento multi-tenant, idempotência, lotes, falha tolerada).
- `src/lib/orphan-inventory.test.ts` — 7 testes (classificação por confiança).
- `src/lib/legacy-reprocess.test.ts` — 5 testes (gate de habilitação, heurística de classificação).
- `tests/integration/imovel-remocao-r2.test.ts` — 3 testes (remoção real ao substituir foto, isolamento multi-tenant).
- `tests/integration/storage-cleanup.test.ts` — 9 testes (outbox na exclusão, dry-run, retenção de 30 dias, confirmação, papel, concorrência, retentativa).
- `tests/integration/legacy-e-orfaos.test.ts` — 5 testes (inventário legado, gate de reprocessamento, inventário de órfãos contra dados reais).

Arquivos de teste pré-existentes ajustados para continuar válidos com a nova validação de URL (120-A), sem alterar o que cada um prova:
- `src/lib/property-mapper.test.ts`, `src/lib/galeria-editorial.test.ts`, `tests/integration/galeria-editorial.test.ts`, `tests/integration/plan-entitlements.test.ts`.

## Build de produção

```
npm run build
```
**Resultado: aprovado.** Rota nova `/platform/storage-cleanup` compilada corretamente (`ƒ`, dinâmica). Nenhum erro de bundling client/server (gate recorrente deste projeto desde a Fase 112) — reverificado.

## Playwright (E2E completo)

```
npm run test:e2e
```

**Primeira execução (1497 testes)**: 1494 aprovados, **3 falhas reais** em `tests/e2e/galeria-editorial.spec.ts` — ver bug #2 abaixo. **Reexecução completa da suíte depois da correção: 1497/1497 aprovados** (19,6 min). Suíte unitária/integração (`npm run test`) também reexecutada por completo depois da correção: **3777 testes, 195 arquivos, todos aprovados.**

## Dois bugs reais encontrados e corrigidos durante o próprio desenvolvimento desta fase (prova-primeiro em ação)

### 1 — Escopo de tenant na consulta de órfãos

Ao escrever o teste de `inventariarObjetosOrfaos`, a primeira versão de `src/app/platform/storage-cleanup/legacy-e-orfaos-actions.ts` usava `prisma.media.findMany({select:{url:true}})` **sem** `organizationId` no `where` — isso violou a extensão de tenant-scoping do Prisma (`src/lib/prisma.ts`), que falha fechada exatamente para impedir esse tipo de consulta cross-tenant acidental. O teste falhou imediatamente (`resultado.ok` era `false`), expondo o erro antes de qualquer commit. Corrigido trocando para `prismaPlatform.media.findMany(...)` — o client sem a extensão, reservado exatamente para esta classe de operação legítima (Super Admin cruzando todo o bucket contra toda a base). Depois da correção, os 5 testes do arquivo passaram.

### 2 — Regressão real em E2E: URLs de fixture `data:` rejeitadas pela nova validação de origem

A primeira rodada completa de `npm run test:e2e` (1497 testes) encontrou **3 falhas reais**, todas em `tests/e2e/galeria-editorial.spec.ts` (cadastro/reordenação de legendas, trocar capa, interação com o campo de legenda). Causa raiz: `prisma/seed-e2e.ts` usa fotos em URL `data:image/svg+xml;utf8,...` (decisão deliberada da Fase 44, documentada no próprio seed: evita que o otimizador do `next/image` tente buscar um host remoto inexistente em E2E). Ao reabrir e resalvar esse imóvel pelo formulário real do admin, a nova validação de origem (Etapa 120-A) rejeitava essas URLs (corretamente, do ponto de vista de "não é um objeto R2 real") — mas isso apagava as fotos de fixture da lista silenciosamente, quebrando os 3 testes que dependiam de reabrir/resalvar.

**Correção**: `parseMidias` (`src/lib/property-mapper.ts`) passou a aceitar URLs `data:` sem a checagem de prefixo — uma URI `data:` é autocontida (carrega o próprio conteúdo, nunca uma referência a storage de qualquer organização), categoricamente diferente do que a validação de origem existe para impedir (apontar para a chave R2 de outra organização, ou para um host externo). Não é um afrouxamento da defesa real — é reconhecer que `data:` nunca teve, e nunca poderia ter, o risco que a validação resolve. Teste novo adicionado (`src/lib/property-mapper.test.ts`) comprovando que `data:` é aceita e que URL fora do prefixo R2 continua rejeitada. **Após a correção, as 3 specs voltaram a passar** (confirmado reexecutando isoladamente `tests/e2e/galeria-editorial.spec.ts`: 27/27) e a suíte completa de testes unitários/integração (`npm run test`) foi reexecutada e permaneceu 100% aprovada.
