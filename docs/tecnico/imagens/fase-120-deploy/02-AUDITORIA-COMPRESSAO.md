# 02 — Auditoria de compressão (Sharp + WebP)

## Status nesta publicação: código enviado, **funcionalidade DESLIGADA por padrão**

Decisão desta auditoria: a compressão (Etapa 120-B) é publicada em produção, mas atrás de um gate novo (`compressaoDeImovelHabilitada()`, `src/lib/property-image-limits.ts`) que **só liga com `PROPERTY_IMAGE_COMPRESSION_ENABLED=true`** — variável que **não existe em nenhum ambiente**, confirmado por não ter sido definida nesta sessão em lugar nenhum. Enquanto isso, o upload de fotos de imóvel em produção continua **exatamente como era antes de toda a Fase 120** (arquivo original, sem reencode) — **zero mudança de comportamento em produção a partir deste deploy**, até alguém decidir ativar o gate.

## Por que a funcionalidade fica desligada — critério bloqueante do briefing

> "A validação visual é um critério bloqueante... Se não houver amostras reais autorizadas ou meios confiáveis para inspecionar visualmente o resultado, não liberar a compressão em produção."

**Esta sessão não tinha nenhuma fotografia real de imóvel devidamente autorizada disponível.** A única fonte local de imagens (`public/demo-fotos/*.jpg`, 8 arquivos) é drift pré-existente de origem e licença desconhecidas — não documentada em nenhuma fase anterior deste projeto como autorizada para uso, e a doutrina já estabelecida em fases comerciais anteriores (Fase 115) é explícita: nunca usar fotografia real de imóvel sem autorização confirmada, nem imagem de licença desconhecida. Usar esses arquivos como substituto da validação visual exigida seria inventar uma evidência que esta sessão não tem — **não feito**.

**Conclusão**: validação visual não realizada → compressão não liberada ativa em produção, exatamente como o briefing instrui para este cenário. O código é publicado (pronto para ser ligado assim que a validação acontecer, sem precisar de novo deploy), mas a trava permanece.

## O que FOI verificado nesta auditoria (automatizado, não substitui a validação visual)

Confirmado por releitura e teste automatizado real (`src/lib/property-image-processar.test.ts`, 12 testes, reexecutados nesta auditoria):
- Sharp executa no servidor (`src/lib/property-image-processar.ts`, nunca no cliente).
- Saída sempre WebP, qualidade 82, largura máxima 2048px.
- Proporção preservada (sem `fit: cover`/crop), sem ampliação de imagem menor que o teto.
- Correção de orientação EXIF antes do reencode.
- Remoção de metadados comprovada (teste embute EXIF real via `sharp().withMetadata()` e confirma ausência na saída).
- Validação de conteúdo real: decodificação completa via `sharp` rejeita entrada inválida (bytes não-imagem, buffer vazio) sem lançar exceção não tratada.
- Proteção contra imagem excessivamente grande: `LIMITE_PIXELS_ENTRADA = 60_000_000` (mesmo teto do Hero).
- A saída enviada ao R2 é sempre a versão processada, nunca o arquivo original — confirmado por leitura de `route.ts` (reatribuição de `bytes` antes do `PutObjectCommand`) — mas como a ramificação está desligada por padrão, isso só se aplica quando o gate for ativado.

## Compatibilidade

- **Hero institucional**: módulo próprio (`hero-image-processar.ts`) nunca tocado por esta fase — zero risco de regressão, confirmado por `git diff` vazio nesse arquivo.
- **Galerias do CRM / site público**: fotos existentes (qualquer formato aceito antes, `.jpg`/`.png`/`.webp`) continuam servíveis normalmente — nenhuma mudança retroativa.
- **Imagens legadas**: não tocadas — o reprocessamento retroativo (Etapa 120-E) nem foi publicado nesta rodada.

## Limites de memória e processamento — risco conhecido, não mitigado, documentado

Mesmo risco já identificado na Fase 118/120: processamento síncrono dentro da mesma requisição, sem fila/worker dedicado, processo compartilhado entre organizações. Como a funcionalidade está desligada por padrão nesta publicação, **este risco não se materializa em produção até o gate ser ativado** — fica registrado para quando essa decisão for tomada.

## Decisão para ativação futura

Quando houver fotografias reais autorizadas disponíveis (de uma organização real com consentimento, ou de um banco de imagens com licença confirmada), a validação visual descrita no briefing (sala, fachada, cozinha, banheiro, pouca luz, muitos detalhes, vertical, horizontal — original vs. WebP processado) deve ser executada por um humano antes de definir `PROPERTY_IMAGE_COMPRESSION_ENABLED=true` em produção. Nenhum novo deploy é necessário para essa ativação — só a variável de ambiente.
