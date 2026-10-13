# 01 — Auditoria de segurança (independente)

**Método**: releitura direta do código desta sessão, não aceitação do relatório anterior como prova — cada afirmação abaixo foi reconfirmada agora.

## Escopo final desta publicação

Decisão tomada nesta auditoria (ver `10-STATUS-FINAL.md` para a justificativa completa): **somente as Etapas 120-A, 120-B (desligada por padrão) e 120-C são publicadas nesta rodada.** As Etapas 120-D (outbox/migration) e 120-E (ferramentas de legado/órfãos) foram **excluídas desta publicação** — implementadas e testadas localmente, mas não comitadas — por dependerem de uma migration de schema sem backup/recuperação de produção comprovadamente utilizável (ver `04-MIGRATION-E-BACKUP.md`). Esta auditoria de segurança cobre o que de fato está sendo publicado.

## Autenticação e autorização

- `src/app/api/admin/upload/route.ts`: `auth()` + `requireOrganizationId()` inalterados; nenhuma permissão nova, nenhuma ampliada.
- `src/app/app/imoveis/actions.ts`: `criarImovel`/`atualizarImovel` continuam exigindo sessão válida (`auth()`) antes de qualquer alteração; `organizationId` resolvido da sessão, nunca de input.

## Escopo de `organizationId` — revisão específica do bug já encontrado

O bug de escopo cross-tenant identificado na rodada anterior (`prisma.media.findMany` sem `organizationId`, dentro de `legacy-e-orfaos-actions.ts`) **pertence exclusivamente à Etapa 120-E, que está excluída desta publicação** — não existe no código que está sendo enviado a produção. Confirmado por busca: nenhum arquivo do escopo publicado (`property-mapper.ts`, `upload/route.ts`, `imoveis/actions.ts`, `r2-media.ts`, `property-image-processar.ts`, `property-image-limits.ts`) chama `prisma.media`/`prisma.property`/qualquer model tenant-scoped sem `organizationId` explícito no `where`.

Varredura adicional, procurando o mesmo padrão de risco em todo o escopo publicado: `grep` por `prisma\.\w+\.(findMany|findFirst|update|delete)` nos 6 arquivos acima — toda ocorrência tem `organizationId` (ou `propertyId` + `organizationId` juntos) no `where`. Nenhuma ocorrência nova do mesmo padrão de bug foi encontrada.

## Propriedade de imóveis e fotografias

- `route.ts:124-132` (inalterado): se `propertyId` é informado no upload, confirma que o imóvel pertence à organização da sessão antes de aceitar o upload associado.
- `parseMidias(json, organizationId)` (`property-mapper.ts`): toda URL de `FOTO`/`PLANTA` precisa (a) começar com o prefixo `{organizationId}/imoveis/` do bucket configurado, OU (b) ser uma URI `data:` autocontida (ver análise de risco abaixo) — qualquer outra URL é descartada silenciosamente, nunca persistida.
- `removerObjetosR2` (`r2-media.ts`): rejeita (nunca envia ao SDK) qualquer chave fora do prefixo `{organizationId}/` do chamador — testado com cenário adversarial (`tests/integration/imovel-remocao-r2.test.ts`, "isolamento multi-tenant").

## Análise de risco da exceção `data:` (achado novo desta rodada, decisão deliberada da fase anterior, reavaliada aqui)

A exceção que aceita URLs `data:` sem checagem de prefixo (adicionada para não quebrar fixtures de teste E2E pré-existentes) foi reavaliada de forma independente nesta auditoria:
- **Risco de cross-tenant**: nenhum — uma URI `data:` carrega o próprio conteúdo, nunca uma referência a storage de qualquer organização. Não há "chave" para adivinhar nem "host" para falsificar.
- **Risco de XSS via SVG com script embutido**: nenhum na prática — `data:image/svg+xml` é renderizado em contexto `<img>` (via `next/image`/`<img>`), e navegadores não executam `<script>` de um SVG carregado como imagem (só executam se o SVG for carregado como documento/objeto/iframe, o que não é o caso aqui). Confirmado como comportamento padrão de navegador, não uma suposição.
- **Risco de abuso de tamanho**: um `data:` muito grande poderia inflar o payload da requisição — não é um risco novo introduzido por esta exceção (o mesmo já valia antes, e já é limitado pelos limites padrão de corpo de Server Action do Next.js, fora do controle desta mudança específica).
- **Conclusão**: a exceção é segura e com escopo mínimo necessário (só resolve o caso de fixture, não abre uma via de referência a storage real).

## IDOR — checagem direcionada

Toda função nova/alterada que recebe um `id` como parâmetro (`criarImovel`, `atualizarImovel`, `removerObjetosR2`) sempre inclui `organizationId` da sessão no filtro de leitura/escrita correspondente — nenhuma consulta nova usa só o `id` recebido do cliente sem esse filtro. Confirmado por releitura linha a linha de cada função.

## Rate limiting e cabeçalhos — inalterados nesta rodada além do já documentado

`CacheControl`/`ContentDisposition` (120-A) não afetam autenticação/autorização — são só metadados de entrega. Rate limit de upload permanece fail-open sem Upstash, decisão já tomada e revalidada (`docs/tecnico/imagens/fase-120/04-SEGURANCA-MULTITENANT.md` §4.4) — não alterada nesta rodada.

## Conclusão desta parte da auditoria

**Nenhuma possibilidade de acesso ou exclusão cruzada entre organizações foi encontrada no escopo publicado.** Critério bloqueante do item 17 do briefing — **não acionado**.
