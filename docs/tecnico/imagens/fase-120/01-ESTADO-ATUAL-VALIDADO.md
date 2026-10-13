# 01 — Revalidação do estado atual

**Método**: releitura direta dos arquivos de código nesta fase (não apenas citação da Fase 119). O repositório está no mesmo commit (`42b95dd`) e sem nenhuma alteração em `src/`/`prisma/` desde a Fase 119 (confirmado via `git status --short` — só há drift pré-existente e documentação nova, nenhum código mudou) — portanto **zero divergência** foi encontrada entre o relatado na Fase 119 e o código atual. Cada item abaixo foi relido nesta fase, não presumido.

## 1. Onde está implementado o upload de fotografias dos imóveis

`src/app/api/admin/upload/route.ts` (único endpoint de upload de qualquer mídia do produto, inclusive fotos de imóvel via `pasta=imoveis`). **Confirmado, sem divergência.**

## 2. Quais endpoints/Server Actions participam do fluxo

- `POST /api/admin/upload` (upload do arquivo em si, devolve URL).
- `criarImovel`/`atualizarImovel` (`src/app/app/imoveis/actions.ts:94` e `:258` respectivamente — linhas confirmadas nesta releitura) — persistem a URL recebida como linha(s) `Media`, substituindo a lista completa a cada submissão (`midiasParaCriar`, `src/lib/property-mapper.ts:349-351`). **Confirmado, sem divergência.**

## 3. Como a organização é identificada e validada

`requireOrganizationId()` resolve da sessão (`route.ts:55`), nunca de input do cliente. Usado tanto para o prefixo da chave R2 quanto para o `where` de qualquer consulta ao banco. **Confirmado, sem divergência.**

## 4. Como os arquivos são recebidos

`FormData` via `request.formData()` (`route.ts:70`) — leitura completa em memória (`Buffer.from(await arquivo.arrayBuffer())`, linha 139) antes de qualquer envio ao R2. Não há streaming parcial nem upload em chunks. **Confirmado, sem divergência.**

## 5. Como MIME/extensão/tamanho são verificados

`validarArquivo()` (`src/lib/upload-validation.ts:129-175`): MIME declarado contra allowlist (`TIPOS_PERMITIDOS`), extensão do nome do arquivo contra a lista de extensões aceitas para aquele MIME, tamanho contra `LIMITE_TAMANHO_BYTES.imagem = 10MB`, e assinatura binária dos primeiros 16 bytes. **Confirmado, sem divergência.**

## 6. Se há decodificação real das imagens

**Só para `pasta === "hero"`** (`src/lib/hero-image-processar.ts`, via `sharp(...).metadata()` e depois o pipeline completo de `.rotate().resize().webp()`). Para `imoveis`/`usuarios`/`site`/`perfil`, a verificação de assinatura lê só os primeiros 16 bytes (`upload-validation.ts:165`), nunca decodifica a imagem inteira. **Confirmado, sem divergência** — releitura integral de `route.ts:143-173` confirma que a única ramificação condicional de processamento é `if (pasta === "hero")`.

## 7. Como a chave do objeto R2 é construída

`${organizationId}/${pasta}/${crypto.randomUUID()}.${extensao}` (`route.ts:161`) — UUID gerado no servidor, nunca o nome original do arquivo. **Confirmado, sem divergência.**

## 8. Como a URL é armazenada no banco

Campo único `Media.url` (`prisma/schema.prisma:648`, modelo relido nesta fase) — sem campo de variante/thumbnail. A URL completa (`${publicUrl}/${chave}`) é devolvida pela rota de upload (`route.ts:204`) e só persistida quando o Server Action do imóvel grava a lista de mídias. **Confirmado, sem divergência.**

## 9. Como as imagens são exibidas no CRM e no site público

`next/image` apontando direto para a URL pública do R2, com `sizes` por componente (`src/components/GaleriaFotos.tsx:323,430,507,612`, relido nesta fase) — otimização/redimensionamento ocorre em tempo de requisição, no servidor Next, nunca alterando o objeto original armazenado. `next.config.ts` restringe `images.remotePatterns` ao host de `R2_PUBLIC_URL` (via `R2_IMAGE_HOST`, `src/lib/security-headers.ts:19-29`). **Confirmado, sem divergência.**

## 10. Como funciona a exclusão de uma fotografia

**Não existe uma ação isolada "excluir esta foto"** — a edição do imóvel substitui a lista inteira de mídias; uma foto ausente da nova lista tem sua linha `Media` apagada (`prisma.media.deleteMany`, `src/app/app/imoveis/actions.ts:354`, relido nesta fase), mas o objeto no R2 nunca é removido nesse momento (comentário explícito no código, linhas 325-329, relido e confirmado textualmente idêntico ao citado na Fase 119). **Confirmado, sem divergência.**

## 11. Como funciona a exclusão de um imóvel

**Não existe ação isolada de excluir um imóvel individualmente** fora da exclusão completa de uma organização — confirmado por nova busca ampla (`property.delete`/`excluirImovel`) sem resultado. Um imóvel só é removido junto com toda a organização, ou tratado como `INACTIVE` (nunca deletado em si). **Confirmado, sem divergência.**

## 12. Como funciona a exclusão de uma organização

`deletarOrganization()` (`src/app/platform/organizations/[id]/actions.ts:397-467`, relido integralmente nesta fase) — transação de ~25 `deleteMany`/`delete` encadeados, `tx.property.deleteMany` (linha 442) aciona `onDelete: Cascade` em `Media.property` (`prisma/schema.prisma:645`). **Confirmado por releitura linha a linha: zero chamadas ao cliente R2 em toda a função.** **Confirmado, sem divergência.**

## 13. Quais funções já implementam Sharp + WebP

Confirmado por grep nesta fase (`grep -rn "sharp" src/`, excluindo testes): 4 arquivos usam `sharp` — `src/lib/hero-image-processar.ts` (Hero, único que gera WebP como formato de ARMAZENAMENTO), `src/lib/og-imagem.ts` (Open Graph, reencode para JPEG, não é armazenamento permanente — gerado sob demanda), `src/lib/anuncio-imovel-render.ts` (gerador de criativo de marketing, não altera o que fica armazenado como foto do imóvel), `src/lib/branding/extrair-paleta-logo.ts` (análise de cor do logo, não gera arquivo de saída). **Confirmado, sem divergência** — nenhum novo uso de `sharp` foi introduzido desde a Fase 119.

## 14. Funções reutilizáveis para remoção de objetos no R2

**Não existe um módulo/helper reutilizável de remoção** — confirmado por nova busca (`grep -rn "DeleteObjectCommand\|DeleteObjectsCommand" src/`): único resultado é o uso inline em `src/app/app/manutencao/actions.ts:3,79`, dentro de `limparMidiasOrfas()`. Qualquer implementação futura de exclusão de foto individual, de imóvel ou de organização precisaria, ou (a) reaproveitar essa mesma lógica extraindo-a para um módulo compartilhado (`src/lib/r2.ts` atualmente só exporta `getR2Client()`, sem nenhuma função de alto nível de delete/list), ou (b) duplicar a lógica — **recomenda-se (a)**, ver `08-ROADMAP-TECNICO.md`.

## 15. Mecanismos de auditoria/rastreabilidade existentes

- `logActivity` é chamado no sucesso e na falha de upload (`route.ts:181-187,191-202`), registrando `pasta`, `chave`, `nomeOriginal` sanitizado e `propertyId`.
- `limparMidiasOrfas()` **não** registra em nenhum log quais chaves específicas foram removidas — retorna só `{ totalObjetos, totalRemovidas }` (contagens agregadas), confirmado por releitura de `manutencao/actions.ts:87`.
- `deletarOrganization()` registra em `PlatformAuditLog` a exclusão da organização em si (ação de nível de plataforma), mas não registra nenhuma lista de chaves R2 associadas (porque nunca as consulta).

**Conclusão da revalidação**: todos os 10 achados da Fase 119 (e os pontos adicionais de investigação pedidos nesta Etapa 1) foram **confirmados integralmente, sem nenhuma divergência**, porque o código-fonte não mudou entre as duas fases. O planejamento desta fase parte, portanto, de uma base de evidência já verificada duas vezes de forma independente.
