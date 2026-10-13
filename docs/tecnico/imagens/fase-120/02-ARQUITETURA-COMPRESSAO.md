# 02 — Arquitetura de compressão (proposta, não implementada)

## Fluxo recomendado — avaliação da ordem sugerida no briefing

> Upload recebido → Autenticação → Autorização → Validação de conteúdo → Decodificação → Correção de orientação → Remoção de metadados → Redimensionamento → Conversão WebP → Upload R2 → Persistência no banco.

**Esta ordem é compatível com a arquitetura real**, com um ajuste de precisão: no código atual (`route.ts`), autenticação/autorização/validação de conteúdo (magic bytes) já ocorrem ANTES de qualquer decodificação — exatamente a ordem proposta. A decodificação completa (sharp) viria depois da validação leve (magic bytes), como uma segunda camada, não uma substituta: a validação leve continua útil para rejeitar rapidamente arquivos obviamente inválidos antes de pagar o custo de decodificação completa.

Fluxo final proposto, mapeado para o código real:
1. `auth()` + `requireOrganizationId()` — já existe, inalterado.
2. Allowlist de pasta + papel do usuário — já existe, inalterado.
3. Rate limit de upload — já existe, inalterado (ver `04-SEGURANCA-MULTITENANT.md` sobre o comportamento fail-open).
4. `validarArquivo()` (magic bytes, MIME, extensão, tamanho de entrada) — já existe, inalterado.
5. **Novo**: decodificação real via `sharp` (equivalente a `processarImagemHero`, mas em módulo próprio, ex.: `processarImagemImovel`).
6. `.rotate()` (corrige orientação EXIF, remove a tag depois como efeito colateral).
7. `.resize()` (largura máxima, preservando proporção, `withoutEnlargement: true`).
8. `.webp({ quality })`.
9. `PutObjectCommand` com os bytes finais — já existe, só muda o conteúdo do `Body`.
10. Persistência da URL no banco (Server Action do imóvel) — já existe, inalterado.

## Perfis de qualidade propostos

### Perfil A — Econômico

| Parâmetro | Valor proposto |
|---|---|
| Largura máxima | 1600px |
| Qualidade WebP | 70 |
| Limite de pixels decodificados | 60.000.000 (mesmo teto do Hero, bloqueia decompression bomb) |

- **Vantagens**: máxima redução de armazenamento/tráfego; arquivos tipicamente abaixo de 200KB mesmo para fotos originais grandes.
- **Limitações**: qualidade 70 pode introduzir artefatos visíveis em áreas de cor sólida ou gradiente suave (ex.: céu, paredes claras) — risco real de "fotografia borrada" mencionado no briefing, especialmente perceptível em zoom da galeria.
- **Quando usar**: se o objetivo prioritário for custo/desempenho acima de qualidade visual percebida — não recomendado como padrão para fotos de imóvel, que são o principal argumento de venda visual do produto.

### Perfil B — Equilibrado (recomendado)

| Parâmetro | Valor proposto |
|---|---|
| Largura máxima | 2048px |
| Qualidade WebP | 82 (mesmo valor já usado e validado em produção pelo Hero) |
| Limite de pixels decodificados | 60.000.000 |

- **Vantagens**: reaproveita o MESMO valor de qualidade já em produção para o Hero — não é um número novo e não testado, é o mesmo parâmetro que já roda sem reclamação conhecida de qualidade. 2048px é suficiente para exibição em qualquer tela atual (incluindo zoom moderado de galeria) sem desperdiçar banda com resolução maior do que qualquer dispositivo exibe de uma vez.
- **Limitações**: ainda não testado especificamente com fotos de interior de imóvel (o Hero é tipicamente uma foto de fachada/paisagem bem iluminada) — recomenda-se um teste visual com uma amostra real de fotos de imóvel (incluindo interiores com pouca luz, ambientes com muito detalhe como cozinhas) antes de fixar definitivamente.
- **Redução esperada**: da ordem de 70-85% frente ao arquivo original não comprimido, consistente com a simulação da Fase 119/120 (`07-CUSTOS-E-CAPACIDADE.md`).

### Perfil C — Alta qualidade

| Parâmetro | Valor proposto |
|---|---|
| Largura máxima | 3000px |
| Qualidade WebP | 90 |
| Limite de pixels decodificados | 60.000.000 |

- **Vantagens**: fidelidade visual máxima, adequada para imóveis de alto padrão onde o detalhe da foto é parte do argumento comercial (acabamentos, texturas).
- **Limitações**: redução de armazenamento bem menor (ainda assim real, frente ao arquivo original sem nenhuma compressão) — arquivos tipicamente maiores que os Perfis A/B, ainda que menores que o original de até 10MB.
- **Quando usar**: possivelmente como opção configurável por plano (ex.: PREMIUM usa Perfil C, BASICO/PRO usam Perfil B) — avaliação comercial, não técnica, registrada em `10-DECISOES-PARA-APROVACAO.md`.

## Recomendação

**Perfil B (Equilibrado) como padrão único inicial**, por reaproveitar um parâmetro já validado em produção (qualidade 82, mesma do Hero) e por equilibrar redução de armazenamento com qualidade visual sem introduzir um número nunca testado. Diferenciar perfis por plano (A/B/C) é uma evolução possível, não necessária para a primeira implementação — adicionaria complexidade de configuração sem evidência ainda de que a diferenciação é comercialmente necessária.

## Parâmetros adicionais a avaliar (sem valor definitivo)

| Parâmetro | Proposta | Observação |
|---|---|---|
| Formatos de entrada aceitos | Manter `image/jpeg`, `image/png`, `image/webp` (inalterado) | Nenhuma mudança na allowlist de entrada — a compressão é uma etapa posterior à validação já existente |
| Tratamento de transparência (PNG) | Preservar canal alfa na conversão para WebP (suportado nativamente pelo formato) | Sem risco técnico identificado, mesmo tratamento já implícito no suporte a WebP do Hero |
| Fotografias panorâmicas | Resize por LARGURA máxima, nunca por altura, preservando proporção original (mesma lógica já usada no Hero, que também não faz crop/`fit: cover` no resize) | Evita distorção; uma foto panorâmica larga e baixa continua proporcional, só reduzida |
| Correção de orientação | `.rotate()` sem argumento (idêntico ao Hero) | Já validado em produção |
| Política de metadados | Remoção total (nenhuma chamada a `.withMetadata()`) — efeito colateral do reencode | Resolve privacidade (EXIF/GPS) sem lógica adicional, ver `03-PRIVACIDADE-EXIF-GPS.md` |
| Preservação de cores | `sharp` preserva perfil de cor por padrão ao reencodar (não força conversão de espaço de cor) — comportamento padrão da biblioteca, sem necessidade de configuração extra | NÃO VERIFICADO em teste real com fotos de imóvel — recomenda-se validação visual antes de produção |
| Conversão aumenta o tamanho? | Comportamento esperado: não, para fotos fotográficas reais (WebP com perda é consistentemente menor que JPEG/PNG de entrada na prática) — mas tecnicamente possível em casos extremos (imagem já muito pequena/comprimida). Proposta: se o resultado comprimido for maior que o original, manter o original (lógica de "usar o menor dos dois") | Proteção simples, baixo custo de implementação |
| Imagens corrompidas | `sharp(...).metadata()` lança exceção para arquivo inválido — já tratado no Hero com `try/catch` retornando erro ao usuário (`hero-image-processar.ts:31-35`); replicar o mesmo padrão | Sem novidade de design, só reaplicação |
| Imagens animadas (WebP/PNG animado) | Não há formato animado na allowlist de entrada (`TIPOS_PERMITIDOS` não inclui GIF; WebP animado não é verificado explicitamente) — **NÃO VERIFICADO**: confirmar se um WebP animado enviado seria processado como estático (perdendo animação) ou rejeitado. Avaliação necessária antes de implementar, não crítica (fotos de imóvel não são tipicamente animadas) |
| Timeout de processamento | Processamento síncrono dentro da mesma requisição HTTP (mesmo padrão do Hero hoje) — avaliar se o timeout padrão da rota/plataforma (DigitalOcean) é suficiente para o pior caso (imagem de 10MB, resolução alta) | NÃO VERIFICADO — recomenda-se medir o tempo real de processamento de uma amostra antes de produção |
| Consumo de CPU/memória | Mesmo padrão de risco já identificado na Fase 118 para o gerador de anúncios: processo compartilhado entre todas as organizações, sem fila/worker dedicado | Ver `06-CONSISTENCIA-BANCO-STORAGE.md` e `04-SEGURANCA-MULTITENANT.md` para mitigação |

**Nenhum destes parâmetros foi fixado nesta fase** — todos ficam pendentes de aprovação em `10-DECISOES-PARA-APROVACAO.md`.
