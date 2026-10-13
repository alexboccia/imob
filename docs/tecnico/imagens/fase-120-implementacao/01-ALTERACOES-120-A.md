# 01 — Etapa 120-A: Segurança de URLs, uploads e cabeçalhos

## Status: IMPLEMENTADO e TESTADO LOCALMENTE

## Validação de origem das URLs (correção da lacuna da Fase 119/120)

- `src/lib/property-mapper.ts` — `parseMidias(json, organizationId)` agora recebe `organizationId` e valida todo item `FOTO`/`PLANTA` com `validarUrlMidiaOrganizacao(url, organizationId, "imoveis")` (`src/lib/branding/favicon-url.ts`, já em produção para materiais/hero/perfil/logo — reaproveitada, não duplicada). Comparação por `origin` de `URL`, nunca `startsWith` sobre string crua — já era assim na função reaproveitada. `VIDEO`/`TOUR` continuam fora dessa checagem, por serem link externo por design (`src/lib/recursos-imovel.ts`).
- Chamadores atualizados: `src/app/app/imoveis/actions.ts` — `criarImovel` e `atualizarImovel` agora resolvem `organizationId` ANTES de chamar `parseMidias`, passando-o explicitamente.

## Segurança de upload — revalidado, sem ampliação de permissão

- `src/app/api/admin/upload/route.ts` — autenticação, papel por pasta (`PAPEIS_POR_PASTA`), rate limit, validação de arquivo (`validarArquivo`) todos mantidos exatamente como estavam. Nenhuma permissão foi ampliada.
- Validação de conteúdo real: reforçada indiretamente pela Etapa 120-B — decodificar a imagem via `sharp` (que agora acontece para `pasta === "imoveis"`) é uma verificação de conteúdo muito mais forte que os 16 bytes de assinatura já existentes.

## Cabeçalhos R2

- `PutObjectCommand` (mesma rota) agora define:
  - `CacheControl: "public, max-age=31536000, immutable"` — seguro porque cada upload gera uma chave UUID nova (nunca reaproveitada); o objeto naquela URL nunca muda depois de criado.
  - `ContentDisposition: "attachment"` para a categoria `documento` (pasta `materiais`, PDFs) e `"inline"` para o resto — mitiga o risco de um PDF com JavaScript embutido ser aberto inline pelo visualizador do navegador.
- Objetos já existentes no R2 **não foram tocados** — os cabeçalhos só se aplicam a novos uploads a partir desta implementação, confirmado por leitura do código (nenhuma chamada de atualização de metadados de objeto existente foi adicionada).

## Testes executados (resultados reais)

- `src/lib/property-mapper.test.ts` — novo teste "descarta FOTO/PLANTA com URL fora do bucket/prefixo da organização": **passou**.
- `src/lib/galeria-editorial.test.ts` e `tests/integration/galeria-editorial.test.ts` — reescritos para gerar URLs válidas por organização (antes usavam strings fixas incompatíveis com a nova validação) — **10/10 testes passaram**, incluindo os dois testes de isolamento multi-tenant/mass-assignment já existentes.
- `tests/integration/plan-entitlements.test.ts` — ajustado (helper `midiasJson` passa a gerar URLs válidas por organização) — **passou integralmente**, confirmando que o enforcement de `PHOTOS_PER_PROPERTY` continua funcionando com a nova validação.
- `tests/integration/imovel-remocao-r2.test.ts` (nova, cobre também 120-C) — inclui o caso "isolamento multi-tenant: remoção de foto na organização A nunca envia chave da organização B ao R2" — **passou**.

## Regressão

Suíte completa (`npm run test`): **3776 testes, 195 arquivos, todos aprovados** após todas as etapas (120-A a 120-E). `npm run build`: aprovado, sem erro de bundling client/server (gate recorrente do projeto desde a Fase 112, reverificado).
