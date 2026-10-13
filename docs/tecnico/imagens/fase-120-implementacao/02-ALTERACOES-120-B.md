# 02 — Etapa 120-B: Compressão Sharp + WebP e privacidade (EXIF/GPS)

## Status: IMPLEMENTADO e TESTADO LOCALMENTE

## Reutilização do padrão do Hero

- Novo módulo `src/lib/property-image-processar.ts`, função `processarImagemImovel(bytesOriginais)` — mesma biblioteca (`sharp`), mesma ordem de operações do Hero (`src/lib/hero-image-processar.ts`): decodificar → `.rotate()` (corrige orientação EXIF e descarta a tag) → `.resize()` → `.webp({quality})`. **Nenhum código do Hero foi alterado** — zero risco de regressão nesse fluxo (confirmado: `git diff` em `hero-image-processar.ts` é vazio).
- Novo módulo `src/lib/property-image-limits.ts` — constantes do Perfil B aprovado: `IMOVEL_LARGURA_MAXIMA_ARMAZENADA = 2048`, `IMOVEL_QUALIDADE_WEBP = 82` (mesmo valor já validado em produção pelo Hero).

## Parâmetros aprovados, aplicados exatamente como decidido

| Parâmetro | Valor |
|---|---|
| Formato de saída | WebP |
| Qualidade | 82 |
| Largura máxima | 2048px |
| Ampliação | Nunca (`withoutEnlargement: true`) |
| Correção de orientação | Sim, antes do resize/encode |
| Metadados | Removidos (nenhuma chamada a `.withMetadata()` no reencode) |
| Limite de pixels decodificados | 60.000.000 (mesmo teto do Hero — bloqueia decompression bomb) |

## Fluxo de processamento — mapeado para o código real

`src/app/api/admin/upload/route.ts`: autenticação → autorização de pasta/papel → rate limit → `validarArquivo` (magic bytes/MIME/extensão/tamanho) → **(novo) `processarImagemImovel(bytes)` quando `pasta === "imoveis"`** → geração da chave UUID → `PutObjectCommand` (já com os cabeçalhos da Etapa A) → resposta com a URL → (Server Action separada) persistência em `Media`. **O R2 recebe a versão processada, nunca o arquivo original** — confirmado por leitura: `bytes` é reatribuído com o resultado de `processarImagemImovel` antes da chamada ao `PutObjectCommand`.

## Privacidade — EXIF/GPS

Resolvido como efeito colateral do reencode, sem lógica adicional dedicada — confirmado por teste automatizado real (não só por leitura de código): `src/lib/property-image-processar.test.ts`, teste "saída não carrega nenhum bloco EXIF, mesmo quando o original tinha GPS/Copyright" — embute um bloco EXIF real via `sharp().withMetadata({exif: {...}})`, confirma que a ENTRADA de fato carregava o bloco (`metaEntrada.exif` definido), processa, e confirma que a SAÍDA não tem bloco EXIF algum (`metaSaida.exif` indefinido). **Resultado: passou.**

## Fotografias já existentes (legadas)

Nenhuma foi tocada — confirmado por desenho (o processamento só ocorre no momento do upload, nunca retroativamente) e por decisão explícita (Fase 120, decisão 4: sem migração em massa). Infraestrutura de reprocessamento sob demanda preparada e **desabilitada** na Etapa 120-E.

## Testes executados (resultados reais)

`src/lib/property-image-processar.test.ts` — **12 testes, todos passaram**: formatos de entrada (JPEG/PNG/WebP), redimensionamento com/sem teto, imagem panorâmica (proporção preservada, sem crop), correção de orientação EXIF, remoção de metadados (orientação e bloco EXIF completo), entrada inválida (bytes não-imagem, buffer vazio).

## Ponto não resolvido nesta fase (registrado, não bloqueante)

Validação visual humana com fotos REAIS de imóvel (não as imagens sintéticas de teste, de cor sólida) **não foi feita** — não havia fotos de imóvel reais/autorizadas disponíveis nesta sessão de desenvolvimento local. Os parâmetros (qualidade 82, 2048px) são os mesmos já validados em produção para o Hero, mas o Hero tipicamente processa fachada/paisagem bem iluminada, não necessariamente representativo de interiores com pouca luz. **Isto bloqueia a recomendação de ativar em produção sem essa validação** — ver `10-PENDENCIAS-E-RISCOS.md` e `11-CHECKLIST-PRE-DEPLOY.md`.
