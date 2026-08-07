# Auditoria final — Production Readiness (Fase 10)

**Data**: 2026-08-07
**Escopo**: validação apenas — nenhuma funcionalidade nova foi implementada
nesta fase. Toda evidência abaixo foi coletada rodando comandos/testes de
verdade nesta sessão (não é uma releitura de documentação anterior sem
verificação).

**Convenção de status**: ✅ Aprovado · ⚠️ Aprovado com ressalva · ❌ Reprovado · 🔲 Fora do escopo desta auditoria

---

## 1. Segurança

### 1.1 Autorização por role — ✅ Aprovado

**Evidência**: `temPapel`/`PAPEIS_GESTAO_*` (`src/lib/authorization.ts`) usados em
9 pontos (`caracteristicas/actions.ts`, `usuarios/actions.ts`, `usuarios/[id]/page.tsx`,
`usuarios/page.tsx`, `tipos-imovel/actions.ts`, `configuracoes/actions.ts`,
`/api/admin/diagnostics`, `/api/admin/upload`, `/api/debug/sentry-check`).
Rota de upload restringe por pasta (`imoveis`: qualquer membro ativo;
`usuarios`/`site`: só quem gerencia usuários/configurações). Testado ao
vivo nesta fase: `/api/admin/diagnostics` retorna `403` sem sessão quando
`NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`, e `200` fora de produção.
**Risco**: nenhum identificado nesta auditoria.
**Correção necessária**: nenhuma.

### 1.2 Isolamento entre tenants — ✅ Aprovado

**Evidência**: Prisma Client Extension (`src/lib/prisma.ts`) injeta/exige
`organizationId` em toda operação de model tenant-scoped. Testado ao vivo
nesta fase, não só por teste automatizado antigo: criei imóvel/cliente/usuário
reais para a Org A (E2E) e confirmei por SQL direto que **nenhum** registro
aparece sob a Org B, e vice-versa (contagem: Org A = 2 imóveis / 1 pessoa /
2 membros; Org B = 1 imóvel / 0 pessoas / 2 membros — os números batem
exatamente com o que cada organização deveria ter). `tests/integration/tenant-isolation.test.ts`
e `tenant-isolation.spec.ts` (E2E) também passando.
**Risco**: nenhum identificado.
**Correção necessária**: nenhuma.

### 1.3 Rate limiting — ⚠️ Aprovado com ressalva (risco real, não hipotético)

**Evidência**: lógica testada (22 testes unitários, `rate-limit.test.ts`,
cobrindo isolamento por IP/e-mail/organização e bloqueio progressivo).
**Porém**: confirmado nesta sessão que `UPSTASH_REDIS_REST_URL`/`_TOKEN`
**não estão configurados nem no `.env` local do desenvolvedor** (que tem
credenciais reais de R2/Resend, mas não de Upstash) — toda execução local
e de CI mostra `"Rate limiting desativado"` no log. O sistema é fail-open
por design (nunca bloqueia usuário legítimo por falta de configuração),
mas isso significa **login, formulário público e upload não têm proteção
de fato contra força bruta/spam/abuso enquanto Upstash não for
configurado em produção**.
**Risco**: Médio-Alto se for pro ar sem Upstash configurado — força bruta
de senha e spam de formulário público ficam sem limite algum.
**Correção necessária**: confirmar que `UPSTASH_REDIS_REST_URL`/`_TOKEN`
de produção estão de fato configurados na DigitalOcean **antes** do
primeiro cliente real (ver pergunta 5 no fim deste relatório) — item de
configuração de painel, não de código.

### 1.4 Upload seguro — ✅ Aprovado

**Evidência**: `upload-validation.ts` com 100% de cobertura (extensão +
MIME + magic bytes + tamanho, allowlist estrita). Chave sempre
`{organizationId}/{pasta}/{uuid-gerado-no-servidor}.{ext}` — nome original
nunca vira parte da chave. Testado ao vivo na Fase 9: ciclo real
PutObject/GetObject/DeleteObject contra o bucket real, chave isolada,
limpo depois. `tests/integration/upload.test.ts` confirma que imóvel de
outra organização é rejeitado antes do upload.
**Risco**: baixo.
**Correção necessária**: nenhuma.

### 1.5 Headers de segurança — ✅ Aprovado

**Evidência testada ao vivo nesta sessão** (`curl -I`): `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
(camera/microfone/geolocalização etc. desligados), `X-Frame-Options: DENY`,
`Content-Security-Policy` presente e bem formada, `X-Powered-By` ausente.
`Strict-Transport-Security` corretamente **ausente** neste teste (`NODE_ENV=test`,
não é produção) — comportamento esperado, não um erro.
**Risco**: nenhum identificado.
**Correção necessária**: nenhuma — confirmar em produção real (HTTPS) que
o HSTS aparece, uma vez, após o primeiro deploy.

### 1.6 CSP — ✅ Aprovado

**Evidência**: política enforced (não Report-Only) — decisão já tomada e
testada na Fase 8 com evidência real (9/9 E2E + varredura de console sem
violação em todas as páginas da lista de teste, incluindo mapa embutido
do Google e Leaflet/OSM). Confirmado ao vivo nesta sessão que a política
ainda está intacta (mesmos domínios mapeados, `unsafe-inline` em
script/style documentado como concessão testada, não descuido).
**Risco**: baixo — a concessão de `unsafe-inline` em `script-src` é
inerente ao Next.js sem nonce (afetaria qualquer app Next não-nonced),
não uma falha de configuração deste projeto.
**Correção necessária**: nenhuma para o piloto. Endurecimento futuro
(nonce via proxy.ts) já está documentado como próximo passo, não
bloqueante.

### 1.7 Sessão — ✅ Aprovado

**Evidência**: `session: { strategy: "jwt" }` (`auth.config.ts`), assinada
com `AUTH_SECRET`. Rotação documentada (`secrets-rotation.md`) e
confirma-se corretamente que rotacionar encerra toda sessão ativa (JWT
antigo falha verificação de assinatura). `.env.test` usa um `AUTH_SECRET`
fixo e claramente marcado como não-produção, nunca reaproveitado.
**Risco**: nenhum identificado.
**Correção necessária**: nenhuma.

### 1.8 Formulários públicos — ✅ Aprovado

**Evidência**: honeypot + limiar de tempo mínimo (`CamposAntiSpam`) +
rate limiting (quando Upstash configurado — ver 1.3) em `enviarContato`/
`enviarAnuncioProprietario`. `public-form.spec.ts` (E2E) passando —
formulário de contato cria lead de verdade. Schemas Zod (`contato-schema.ts`)
testados unitariamente.
**Risco**: acoplado ao risco 1.3 (rate limiting) — sem Upstash, a
proteção real contra spam automatizado é só o honeypot + timing, que um
bot minimamente sofisticado contorna.
**Correção necessária**: mesma da seção 1.3.

---

## 2. Qualidade

| Verificação | Resultado | Evidência |
|---|---|---|
| `npx tsc --noEmit` | ✅ Aprovado | Sem erro, rodado nesta sessão |
| `npm run lint` | ✅ Aprovado | Sem erro/warning, rodado nesta sessão |
| Testes unitários + integração | ✅ Aprovado | **182/182** passando (`npm run test:coverage`), cobertura dos módulos críticos: 97.2% statements / 94.95% branches / 100% funções / 98.61% linhas — acima dos limiares configurados |
| Testes E2E | ✅ Aprovado | **9/9** passando (`npm run test:e2e`), rodado múltiplas vezes nesta sessão incluindo após a auditoria manual de dois tenants |
| Build de produção | ✅ Aprovado | `npm run build` conclui sem erro, todas as rotas (incluindo `/api/health`, `/robots.txt`, `/sitemap.xml`) presentes no manifest |

**Achado de qualidade não bloqueante, fora dos comandos acima** (por isso
este relatório não se apoia só em typecheck/lint/build passando):

- **Bug real, encontrado testando ao vivo**: cadastrar cliente/lead pelo
  CRM (`/app/clientes`) **falha** se o campo "Origem" não for selecionado,
  mesmo o campo sendo tratado como opcional na UI. Causa raiz confirmada em
  `src/app/app/clientes/actions.ts`: `origem: z.enum([...]).optional()` não
  aceita string vazia, diferente de `email`/`telefone` no mesmo schema, que
  usam `.optional().or(z.literal(""))`. Não bloqueia o restante do fluxo
  (contornável selecionando qualquer opção), mas é um defeito real que
  afetaria um usuário de verdade tentando cadastrar um lead rapidamente.
  **Correção necessária**: alinhar `origem` ao mesmo padrão de `email`/`telefone`
  no schema — mudança pequena e localizada, não aplicada nesta fase
  (fora do escopo: "não implemente novas funcionalidades").
- **Bug pré-existente, já documentado nas Fases 7–9, ainda presente**: warning
  recorrente em toda renderização de formulário de imóvel — *"Only plain
  objects can be passed to Client Components from Server Components. Decimal
  objects are not supported"* (`imovel.price`, tipo `Decimal` do Prisma,
  passado direto pra um Client Component em `imoveis/[id]/page.tsx`). Não
  quebra funcionalmente (os testes que dependem dessas páginas continuam
  passando), mas é ruído real de console em produção. **Correção necessária**:
  serializar o `Decimal` (`.toNumber()`/`.toString()`) antes de passar pro
  componente cliente — não aplicada nesta fase.

---

## 3. Performance

### 3.1 Paginação no banco — ✅ Aprovado

**Evidência**: `interpretarPaginacao` (`src/lib/pagination.ts`) sempre
converte pra `skip`/`take` reais do Prisma (nunca busca tudo e corta em
memória). `page`/`pageSize` clampados server-side (`PAGE_SIZE_MAXIMO = 100`,
`PAGINA_MAXIMA = 500`) — nunca confia em input cru do cliente. Testado
por unidade (`pagination.test.ts`).

### 3.2 Consultas públicas — ✅ Aprovado

**Evidência**: listagem pública de imóveis usa `PAGE_SIZE_PADRAO_PUBLICO = 12`,
`PAGE_SIZE_MAXIMO_PUBLICO = 24` — teto mais baixo que o admin, adequado
pra tráfego não autenticado. Filtro sempre `status: "AVAILABLE"` +
`organizationId` explícito.

### 3.3 Cache — ✅ Aprovado

**Evidência**: `unstable_cache`/`updateTag` em uso em 6 pontos
(`configuracao-contato.ts`, `filtros-imoveis-data.ts`, ações de
imóveis/configurações/tipos, layout público). Home e página de imóvel com
`revalidate` curto (60s) em vez de `force-dynamic` total — otimização já
validada nas fases anteriores sem quebrar a CSP (páginas continuam
estáticas o suficiente pra cache, testado na Fase 8).

### 3.4 Ausência de mistura entre tenants — ✅ Aprovado

Ver seção 1.2 — mesma evidência, testada com dados reais criados nesta
sessão, não só teste automatizado herdado.

### 3.5 Tamanho dos payloads — ✅ Aprovado

**Evidência**: listagens administrativas usam `select` explícito (nunca
`SELECT *`/objeto Prisma completo) em imóveis, clientes e usuários —
confirmado lendo `src/app/app/{imoveis,clientes,usuarios}/page.tsx`.
`/api/health` retorna literalmente `{"status":"ok"}` (14 bytes) —
testado ao vivo.

---

## 4. Operação

| Item | Status | Evidência |
|---|---|---|
| Sentry | ✅ Aprovado | `/api/debug/sentry-check` testado ao vivo nesta sessão (200, evento de teste enviado). Scrubbing de PII com 18 testes unitários. `dataCollection` restritivo configurado. |
| Logs | ✅ Aprovado | Zero `console.*` fora de `src/lib/logger.ts` — confirmado por grep nesta sessão. Logger estruturado com `requestId` correlacionado ao trace da Sentry. |
| Health check | ✅ Aprovado | `/api/health` testado ao vivo: `200` saudável, `503` com banco indisponível (testado na Fase 9), corpo sempre mínimo. `/api/admin/diagnostics` testado ao vivo nesta sessão: `200` com detalhe por dependência fora de produção. |
| CI | ✅ Aprovado | `.github/workflows/ci.yml` presente, dois jobs (`verify`, `e2e`), actions fixadas por SHA. Proteção de branch **documentada como recomendada mas não confirmada como aplicada** (depende de acesso admin ao GitHub — ver pergunta 5). |
| Rollback | ✅ Aprovado, com achado real | `rollback-runbook.md` testado nesta fase anterior (Fase 9): rollback de código pra antes da migration de rename contra o schema atual falha com `table does not exist` — confirmado com `git worktree` isolado, evidência real, não hipotética. |
| Migrations | ✅ Aprovado | `npx prisma migrate status` confirmado nesta sessão: *"Database schema is up to date"*, 23 migrations aplicadas, nenhuma pendente. |
| Backup e restore documentados | ⚠️ Aprovado com ressalva | `database-restore-runbook.md`/`r2-restore-runbook.md` existem e **o mecanismo foi testado de verdade** (ciclo `pg_dump`/`pg_restore` local com contagem de linhas conferida; ciclo de objeto R2 real). **Mas**: retenção de PITR da Neon e status de versionamento do bucket R2 **não puderam ser confirmados** nesta sessão (sem acesso aos painéis) — documentado explicitamente como "A CONFIRMAR", não inventado. |

---

## 5. SEO

| Item | Status | Evidência |
|---|---|---|
| `robots.txt` | ✅ Aprovado | Testado ao vivo: libera site público, bloqueia `/app/` e `/api/`, aponta sitemap. |
| `sitemap.xml` | ✅ Aprovado | Testado ao vivo: 6 URLs (5 páginas estáticas + 1 imóvel disponível da Org A pública), `lastmod` real. Confirmado que roda em `/sitemap.xml` (não `/sitemap/0.xml` — achado da Fase 8 corrigido e ainda válido). |
| Canonical | ✅ Aprovado | Testado ao vivo: `<link rel="canonical" href=".../imoveis/e2e-imovel-editar-a"/>` presente e correto na página de imóvel. |
| Metadata | ✅ Aprovado | Testado ao vivo: `<title>`/`<meta name="description">` presentes na home; Open Graph/Twitter cards por página (Fase 8). |
| Páginas de imóveis indexáveis | ✅ Aprovado | Só imóveis `AVAILABLE` entram no sitemap; `DRAFT`/`INACTIVE` retornam 404; `SOLD`/`RENTED` acessíveis mas fora do sitemap (decisão de produto documentada, não bug). |

---

## 6. Itens fora do escopo desta auditoria 🔲

- Qualquer alteração de código para corrigir os dois bugs encontrados na
  seção 2 (explicitamente vedado: "não implemente novas funcionalidades").
- Confirmação manual nos painéis Neon/Cloudflare/DigitalOcean/GitHub/Sentry
  — não há credencial de acesso a esses painéis nesta sessão (ver
  pergunta 5).
- Teste de carga/stress (volume de requisições simultâneas, muitos
  imóveis no catálogo) — não solicitado nesta fase, e o projeto está
  longe do volume que justificaria isso agora.
- Teste de restore contra a Neon de produção de verdade (só o mecanismo
  genérico foi validado localmente, nunca contra produção — por design,
  ver `database-restore-runbook.md`).
- Auditoria de acessibilidade (WCAG) — não pedida nesta fase.
- Penetration test formal — esta auditoria é uma revisão de engenharia,
  não um pentest com ferramentas especializadas.

---

## Respostas objetivas

### 1. O sistema está pronto para receber o primeiro cliente piloto?

**Sim, condicionalmente.** Toda a arquitetura de isolamento, autorização,
observabilidade e SEO foi validada com evidência real nesta sessão — não
apenas com testes automatizados herdados, mas com dados de verdade
criados e verificados ao vivo. A condição: confirmar que
`UPSTASH_REDIS_REST_*` está configurado em produção antes do piloto (item
1.3) — sem isso, o piloto roda sem proteção de rate limiting, o que é
aceitável por um período curto e controlado (poucos usuários conhecidos),
mas não deveria ficar assim indefinidamente.

### 2. O sistema está pronto para receber um cliente pagante?

**Ainda não, sem antes fechar os itens "A CONFIRMAR".** A diferença
entre piloto e cliente pagante é tolerância a risco: um cliente pagante
espera que backup/restore de verdade funcionem quando necessário. Hoje,
a retenção real de PITR da Neon e o versionamento do bucket R2 **não
estão confirmados** — o mecanismo de restore foi testado, mas a
*janela* de proteção real é desconhecida. Fechar isso (uma verificação
de painel, não trabalho de engenharia) é o bloqueador principal. Rate
limiting em produção (item 1) também deveria estar confirmado antes de
cobrar de alguém.

### 3. Quais riscos residuais foram aceitos?

- **`unsafe-inline` em `script-src`/`style-src` da CSP** — inerente ao
  Next.js sem renderização 100% dinâmica; mitigado por não ter
  `unsafe-eval` em produção e por todos os domínios externos estarem
  mapeados explicitamente. Aceito conscientemente, com plano de
  endurecimento documentado.
- **Rate limiting fail-open por design** — decisão arquitetural
  deliberada (nunca bloquear usuário legítimo por infraestrutura de
  terceiro fora do ar), mas significa que, sem Upstash configurado, não
  há proteção nenhuma, não uma proteção degradada.
- **Bug do campo Origem no CRM e o warning do `Decimal`** — aceitos como
  defeitos conhecidos, não bloqueantes, registrados pra correção numa
  próxima fase de manutenção (não corrigidos aqui por estar fora do
  escopo desta auditoria).

### 4. Qual é o procedimento de rollback?

Documentado em `docs/operations/rollback-runbook.md` e **testado nesta
sessão anterior com evidência real**: reverter o commit em `main` (não só
o botão da DO) pra manter o histórico de deploy consistente com o Git;
antes disso, checar se há migration destrutiva (`DROP`/`RENAME`/`ALTER
... TYPE`) entre a versão atual e o alvo do rollback — se houver
(exemplo real testado: a migration de rename para inglês), rollback de
código sozinho **quebra** (confirmado: `table does not exist`), e a
resposta certa é forward fix ou rollback conjunto de código+banco, não
reverter só o código.

### 5. Quais configurações ainda precisam ser feitas manualmente nos painéis (Neon, Cloudflare, DigitalOcean, GitHub, Sentry)?

| Painel | Pendência |
|---|---|
| **Neon** | Confirmar plano contratado e janela real de PITR; registrar responsável pela conta (`database-restore-runbook.md`, seção 1). |
| **Cloudflare (R2)** | Confirmar se versionamento de objeto está habilitado no bucket e se há lifecycle rules configuradas — não foi possível confirmar via API nesta sessão (token sem permissão de admin de bucket, por design) (`r2-restore-runbook.md`, seção 1). |
| **DigitalOcean** | (a) Confirmar `UPSTASH_REDIS_REST_URL`/`_TOKEN` configurados — item de segurança crítico (seção 1.3); (b) confirmar se `prisma migrate deploy` está automatizado no pipeline de deploy ou se precisa ser rodado manualmente (`deployment-runbook.md`, seção 3); (c) confirmar `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` e `NEXT_PUBLIC_SENTRY_RELEASE=${_self.COMMIT_HASH}` configurados — sem isso as rotas administrativas de diagnóstico ficam sem proteção de role. |
| **GitHub** | Aplicar a proteção de branch recomendada em `main` (PR obrigatório + checks `verify`/`e2e` obrigatórios) — documentada desde a Fase 6, não confirmada como aplicada. |
| **Sentry** | Confirmar `NEXT_PUBLIC_SENTRY_DSN` configurado em produção; configurar os alertas mínimos documentados (aumento de erro 500, falha de upload, falha de banco, regressão após release) — nenhum alerta foi criado, só documentado (sem acesso ao painel). |
