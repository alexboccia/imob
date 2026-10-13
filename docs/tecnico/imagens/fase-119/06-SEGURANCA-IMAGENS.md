# 06 — Segurança das imagens

Riscos classificados por severidade e confiança. Nenhum destes itens foi corrigido nesta fase.

## 1. EXIF/GPS preservado em fotos de imóvel — **Alto (privacidade) · Confirmado**

Fotos enviadas pela pasta `imoveis` nunca passam por reencode (`src/app/api/admin/upload/route.ts:143-173`, confirmado por leitura direta) — qualquer metadado EXIF do arquivo original, incluindo coordenadas de GPS gravadas pela câmera do celular no momento da foto, é preservado integralmente e servido publicamente junto com a imagem. Isso pode expor, por exemplo, a localização exata de onde a foto foi tirada (potencialmente o endereço de um imóvel ainda não divulgado publicamente, ou dados pessoais do fotógrafo). O mecanismo de remoção de EXIF já existe no código (efeito colateral do reencode via `sharp` no Hero, `src/lib/hero-image-processar.ts`) mas nunca foi estendido à pasta `imoveis`.

## 2. Validação por magic bytes, sem decodificação completa — **Médio · Confirmado**

`validarArquivo()` só lê os primeiros 16 bytes para checar a assinatura do formato — nunca decodifica a imagem inteira para `imoveis`/`usuarios`/`site`/`perfil` (só o Hero decodifica de fato, via `sharp`). Isso significa que um arquivo "polyglot" (assinatura JPEG válida nos primeiros bytes + payload diferente mais adiante no arquivo) passaria a validação sem ser detectado. O risco prático de execução no navegador é reduzido porque `PutObjectCommand` sempre define `ContentType` a partir do MIME já validado pelo servidor (nunca do que o cliente declarou livremente) — então o navegador nunca é instruído a tratar o objeto como HTML/JS. O caso mais concreto de risco residual é a pasta `materiais` (aceita PDF, que pode conter JavaScript embutido): o objeto é servido sem `ContentDisposition: attachment`, então um PDF malicioso seria aberto inline pelo visualizador do navegador, que pode executar scripting de PDF.

## 3. Chaves R2 por UUID — fotos de imóveis em DRAFT não têm controle de acesso próprio — **Baixo · Confirmado (mecanismo) / Hipótese (exploração real)**

A chave do objeto (`{organizationId}/{pasta}/{uuid}.{ext}`) usa um UUID gerado no servidor — não é adivinhável por força bruta. `organizationId` é necessariamente público (aparece na URL de qualquer imóvel já publicado daquela organização). A combinação dos dois não é um problema em si (chave de 122 bits de entropia). **Achado real**: a página pública de um imóvel em status `DRAFT`/`INACTIVE` é bloqueada (`fichaEhPublica()`, `src/lib/visibilidade-imovel.ts`), mas essa checagem só impede a PÁGINA de renderizar — o objeto no R2, se alguém já tiver/descobrir a chave exata (ex.: por um link vazado, captura de tela de staging, histórico de navegador), continua acessível diretamente, sem checagem de status. Isto é uma característica arquitetural normal de um bucket público (segurança por segredo da chave), não uma falha de permissão quebrada — mas vale registrar como limitação conhecida.

## 4. Mídia de imóvel (foto/vídeo/planta) não valida a origem da URL — **Médio · Confirmado**

Achado novo desta auditoria, não coberto nas fases anteriores: toda outra categoria de mídia do produto (materiais de apresentação, hero, logo/favicon, foto de perfil de usuário) passa por `validarUrlMidiaOrganizacao()` (`src/lib/branding/favicon-url.ts:36-62`) antes de ser persistida — essa função confirma que a URL pertence ao mesmo host do R2 configurado E ao prefixo exato `{organizationId}/{pasta}/` daquela organização, rejeitando qualquer URL fora desse padrão. **A mídia de imóvel (FOTO/VIDEO/PLANTA) é a única categoria que nunca passa por essa validação** — confirmado por busca: nenhuma chamada a `validarUrlMidiaOrganizacao`/`urlDeUploadValida` existe em `src/app/app/imoveis/actions.ts` nem em `src/lib/property-mapper.ts`. Na prática, qualquer membro ativo da organização (a pasta `imoveis` aceita qualquer papel) poderia submeter o formulário de imóvel com um `Media.url` arbitrário — incluindo, em teoria, a chave de outra organização (se já conhecida/vazada) ou uma URL totalmente externa. O `next.config.ts` (`images.remotePatterns`) limita isso ao HOST do R2 configurado, mas não ao prefixo/organização — então uma URL no mesmo host, só que de outra organização, passaria essa barreira também. Risco prático limitado pela mesma inviabilidade de adivinhar UUIDs (item 3), mas é uma inconsistência real de defesa em profundidade frente ao padrão que o próprio produto já aplica em todo o resto do sistema.

## 5. Cabeçalhos de cache/disposição e exposição de credenciais — **Baixo (cache) · Confirmado / Nenhum achado (credenciais)**

`PutObjectCommand` define só `Bucket`/`Key`/`Body`/`ContentType` — sem `CacheControl` nem `ContentDisposition` (confirmado, `route.ts:167-172`). Qualquer comportamento de cache depende de padrões do R2/Cloudflare, não de uma política explícita do produto — não investigado em profundidade o impacto prático disso (não é um risco de segurança por si, é uma lacuna de controle). Credenciais do R2 (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) só aparecem em dois arquivos server-only (`src/lib/r2.ts`, `src/lib/health.ts`), nunca em resposta de API nem em componente cliente — **nenhuma exposição encontrada**.

## 6. Rate limiting de upload — fail-open sem Upstash — **Baixo-Médio · Confirmado**

30 uploads/usuário e 100 uploads/organização por 10 minutos (`src/lib/rate-limit.ts`), mas **inteiramente desativado** se `UPSTASH_REDIS_REST_URL`/`TOKEN` não estiverem configuradas (`route.ts:94-111`, `obterKvStore()` retorna `null`) — comportamento idêntico ao já documentado para login/formulários em fases anteriores, confirmado aqui especificamente para upload. Decisão de design já conhecida (fail-open com log de aviso), não uma falha nova.

## Resumo por severidade

| # | Risco | Severidade | Confiança |
|---|---|---|---|
| 1 | EXIF/GPS preservado em fotos de imóvel | **Alto** | Confirmado |
| 4 | Mídia de imóvel sem validação de origem da URL (inconsistente com o resto do produto) | **Médio** | Confirmado |
| 2 | Sem decodificação completa fora do Hero; PDF inline sem `ContentDisposition` | **Médio** | Confirmado |
| 3 | DRAFT/INACTIVE sem controle de acesso próprio no storage | **Baixo** | Confirmado (mecanismo) |
| 6 | Rate limit de upload fail-open sem Upstash | **Baixo-Médio** | Confirmado |
| 5 | Sem `CacheControl`/`ContentDisposition` explícito | **Baixo** | Confirmado |

**Recomendação de prioridade**: corrigir o item 1 (EXIF/GPS) é o mesmo trabalho técnico de implementar a compressão do servidor recomendada em `03-ESTRATEGIAS-OTIMIZACAO.md` — resolvem-se juntos. O item 4 (validação de origem da URL) é uma correção pequena e isolada, independente da compressão, que alinha a pasta `imoveis` ao padrão de defesa em profundidade já aplicado em todo o resto do produto.
