# 04 — Segurança e isolamento multi-tenant (plano de correção)

Nenhuma correção foi implementada nesta fase — planejamento apenas, baseado nos achados confirmados em `01-ESTADO-ATUAL-VALIDADO.md` e na Fase 119.

## 4.1. Validação de URLs de mídia de imóvel

**Lacuna confirmada (Fase 119, revalidada)**: `src/lib/property-mapper.ts` (`parseMidias`/`midiasParaCriar`) nunca valida que `Media.url` de uma FOTO/PLANTA pertence ao prefixo `{organizationId}/imoveis/` — ao contrário de materiais, hero, logo/favicon e foto de perfil, que todos passam por `validarUrlMidiaOrganizacao()` (`src/lib/branding/favicon-url.ts:36-62`).

**Plano de correção proposto**:
- Aplicar `validarUrlMidiaOrganizacao(url, organizationId, "imoveis", extensõesPermitidas)` a cada item do tipo `FOTO`/`PLANTA` dentro de `parseMidias`, rejeitando (ou descartando silenciosamente, a decidir) qualquer URL que não bata o padrão.
- **Tratamento diferenciado para `VIDEO`**: esse tipo é link de embed externo por design (YouTube/Vimeo, confirmado em fases anteriores), não deve ser submetido à mesma validação de prefixo R2 — precisa de uma validação própria (já existe parcialmente via `urlTourSegura`, que só checa protocolo HTTP/HTTPS) ou manter como está, documentando a distinção.
- **Chaves/prefixos de objetos**: a validação de prefixo já é suficiente para impedir referência a OUTRA organização (o prefixo inclui `organizationId`), mas não impede referência a uma pasta diferente dentro da MESMA organização (ex.: usar a foto do Hero como foto de imóvel) — avaliar se isso é um problema real (provavelmente não, é a mesma organização, sem vazamento entre tenants) ou se vale restringir ainda mais ao prefixo exato `imoveis/`.
- **URLs legadas**: qualquer `Media.url` já persistida antes da correção não será revalidada retroativamente por esta mudança (a validação só se aplica a NOVAS submissões) — não há ação de migração proposta aqui, risco já mitigado pela raridade prática de abuso (exige conhecer/adivinhar uma chave UUID de outra organização).

## 4.2. Autorização

- **Organização ativa**: já confirmado via `requireOrganizationId()` + checagem de `organization.active` no fluxo de autenticação (confirmado em fases anteriores do produto, não re-auditado aqui por não ser específico de imagens).
- **Permissões do usuário**: já implementado via `PAPEIS_POR_PASTA` (`route.ts:30-44`) — `imoveis` aceita qualquer membro ativo, mesmo nível já exigido para editar o imóvel em si. **Nenhuma mudança proposta aqui** — o nível de permissão já reflete a mesma regra usada no resto do CRM para edição de imóvel.
- **Propriedade do imóvel**: já validado quando `propertyId` é informado no upload (`route.ts:124-132`). **Sem mudança proposta.**
- **Propriedade da fotografia**: não existe o conceito de "dono de uma foto específica" além da organização — uma foto pertence ao imóvel/organização, não a um usuário individual. Não há lacuna aqui além da já tratada em 4.1 (URL pertencer à organização certa).
- **Impedir substituição/exclusão de arquivo de outra organização**: já garantido pelo mecanismo de prefixo + sessão (ver `01-ESTADO-ATUAL-VALIDADO.md` item 12 e a análise de `limparMidiasOrfas()` na Fase 119) — reforçado pela correção de 4.1.

## 4.3. Upload

| Item | Estado atual | Proposta |
|---|---|---|
| Validação de conteúdo real | Só magic bytes (16 bytes), sem decode completo fora do Hero | Decodificar com `sharp` como parte do pipeline de compressão (`02-ARQUITETURA-COMPRESSAO.md`) — resolve a validação de conteúdo E a compressão com a MESMA mudança, já que decodificar com sucesso já é, por si, uma validação muito mais forte que magic bytes |
| Arquivos maliciosos (polyglot) | Residual depois da correção acima — decodificar com sucesso via `sharp` rejeitaria a maioria dos polyglots não-imagem reais | Nenhuma ação adicional necessária além da compressão proposta |
| PDF com JavaScript embutido (pasta `materiais`) | Sem `ContentDisposition`, servido inline | Definir `ContentDisposition: attachment` para a pasta `materiais` especificamente (não precisa de decode de PDF, é um cabeçalho de serving) |
| Dimensões/tamanho excessivos | Tamanho já limitado a 10MB; dimensões não limitadas antes do decode | `LIMITE_PIXELS_ENTRADA` (mesmo padrão do Hero, 60M pixels) já bloqueia decompression bomb — replicar no pipeline de `imoveis` |
| Consumo excessivo de memória | Já lê o arquivo inteiro em buffer hoje (sem compressão) — a compressão não piora esse padrão, só adiciona o custo de decode/encode em cima do que já existe | Nenhuma mudança adicional de arquitetura necessária — mesmo padrão de risco já aceito para o Hero |
| Sobrescrita de objetos indevidos | Chave sempre um UUID novo por upload — nunca sobrescreve um objeto existente | Nenhuma ação necessária, já seguro por design |

## 4.4. Rate limiting — fail-open vs. fail-closed

**Estado atual confirmado**: sem `UPSTASH_REDIS_REST_URL`/`TOKEN` configuradas, `obterKvStore()` retorna `null` e TODO rate limiting (login, upload, formulários) fica desativado silenciosamente (só um log de aviso).

**Análise solicitada pelo briefing — não presumir que fail-closed é sempre correto**:
- **Fail-closed em upload** (bloquear todo upload se o rate limiter estiver indisponível) protegeria contra abuso de armazenamento em um cenário de indisponibilidade do Upstash, mas **tornaria uma falha de um serviço de terceiro (rate limiting) em uma interrupção total de uma funcionalidade central do produto** (cadastrar imóvel) — trade-off desfavorável para um serviço cuja função é só DEFENSIVA (conter abuso), não essencial ao funcionamento correto.
- **Fail-open** (comportamento atual) prioriza disponibilidade sobre a defesa contra abuso de taxa — aceitável para upload, porque o verdadeiro limite estrutural contra abuso de armazenamento já existe de forma independente do rate limiter: o limite de plano `PHOTOS_PER_PROPERTY`/`PROPERTIES` (enforced no banco, nunca fail-open, sempre verificado antes de persistir). Ou seja, mesmo sem rate limiting de TAXA, o produto já impede abuso de VOLUME por outro mecanismo.
- **Recomendação**: manter fail-open para upload (já é o comportamento, não propor mudança) — justificado pela existência de um segundo controle (limite de plano) que não depende do Upstash. Recomenda-se, em vez de mudar a política de fail-open/closed, **melhorar a observabilidade**: alertar o Super Admin (via Sentry, já existente no produto) sempre que `obterKvStore()` retornar `null` em produção, para que a ausência do Upstash seja percebida rapidamente, não silenciosamente.

## 4.5. Cabeçalhos e cache

| Item | Estado atual | Proposta |
|---|---|---|
| `ContentType` | Sempre o MIME validado pelo servidor (nunca o declarado livremente pelo cliente) | Manter — já correto |
| `CacheControl` | Ausente — depende de padrão do R2/Cloudflare | Definir cache longo e imutável (ex.: `public, max-age=31536000, immutable`) — seguro porque CADA upload gera uma chave UUID NOVA, nunca reaproveitada; a imagem naquela URL nunca muda depois de criada, então cache agressivo não corre risco de servir conteúdo desatualizado |
| `ContentDisposition` | Ausente | `inline` explícito para imagens (comportamento já efetivo por omissão, mas tornar explícito remove ambiguidade); `attachment` para a pasta `materiais` (PDFs), mitigando o risco de execução de JavaScript embutido em PDF aberto inline |
| Versionamento de URL / invalidação de cache | Não é um problema hoje — toda substituição de foto gera uma CHAVE NOVA (nunca sobrescreve a mesma URL), então não há necessidade de invalidação de cache | Nenhuma ação necessária — a arquitetura de UUID-por-upload já resolve isso "de graça" |

## Classificação de risco consolidada (severidade × probabilidade × impacto)

| Risco | Severidade | Probabilidade | Impacto | Prioridade de correção |
|---|---|---|---|---|
| EXIF/GPS preservado | Alto | Alta (qualquer foto de celular com GPS ativado) | Privacidade de localização exposta publicamente | **1 — resolvida junto com a compressão** |
| Mídia de imóvel sem validação de origem de URL | Médio | Baixa (exige conhecer/adivinhar chave de outra org) | Inconsistência de defesa em profundidade, potencial referência cruzada | **2** |
| PDF com JS embutido servido inline | Médio | Baixa (exige upload deliberado de PDF malicioso por um membro já autenticado da própria organização) | Execução de script no contexto do visualizador de PDF do visitante | **3** |
| Rate limit de upload fail-open sem Upstash | Baixo-Médio | Depende de operação (Upstash mal configurado) | Mitigado por limite de plano independente | 4 — monitorar, não corrigir política |
| DRAFT sem controle de acesso próprio no storage | Baixo | Muito baixa (exige já ter/vazar a chave exata) | Característica arquitetural de bucket público, não falha de permissão | Não bloqueante |
