# Sistema Imobiliário

Site público (vitrine de imóveis) + painel administrativo (cadastro de imóveis, mídia, CRM de clientes e controle de vendas/locações). Ver [PRD.md](./PRD.md) para o escopo completo do produto.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **PostgreSQL + Prisma 7** (com driver adapter `@prisma/adapter-pg`)
- **Auth.js (NextAuth v5)** — login do painel admin (Credentials/e-mail+senha)
- **Cloudflare R2** (S3-compatible) — armazenamento de fotos dos imóveis
- **Docker Compose** — PostgreSQL local de desenvolvimento

## Como rodar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Suba o banco de dados local:
   ```bash
   docker compose up -d db
   ```

3. Copie/ajuste o `.env` (já vem com um `DATABASE_URL` funcional para o Docker Compose local). Preencha as credenciais do Cloudflare R2 quando for testar upload de fotos (ver seção abaixo) — sem isso, o resto do sistema funciona normalmente, só o upload de mídia retorna erro.

4. Rode as migrations e crie o usuário administrador inicial:
   ```bash
   npx prisma migrate dev
   npx prisma db seed
   ```
   Isso cria um usuário administrador com e-mail `admin@example.com` e senha `admin123` (ou os valores definidos em `SEED_ADMIN_EMAIL` / `SEED_ADMIN_SENHA` no `.env`). **Troque a senha em produção.**

5. Suba o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

   - Site público: http://localhost:3000
   - Painel admin: http://localhost:3000/app/login

## Configuração do Cloudflare R2 (upload de fotos)

Preencha no `.env`:
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — credenciais de uma API Token do R2 (Cloudflare Dashboard → R2 → Manage API Tokens).
- `R2_BUCKET_NAME` — nome do bucket criado no R2.
- `R2_PUBLIC_URL` — URL pública do bucket (domínio customizado ou `https://pub-xxxx.r2.dev` habilitado no bucket).

### Limites e regras de upload

O endpoint `/api/admin/upload` (usado pelo cadastro de imóveis, foto de
usuário e logo da organização) valida cada arquivo em várias camadas antes
de enviar pro R2 — ver `src/lib/upload-validation.ts` para a fonte de
verdade:

| Tipo aceito | MIME | Extensões | Limite |
|---|---|---|---|
| Imagem (JPEG) | `image/jpeg` | `.jpg`, `.jpeg` | 10MB |
| Imagem (PNG) | `image/png` | `.png` | 10MB |
| Imagem (WEBP) | `image/webp` | `.webp` | 10MB |

Nenhum outro tipo é aceito (SVG, HTML, JS, executáveis, arquivos
compactados, PDF, vídeo etc.) — a lista acima é uma allowlist estrita, não
um filtro de bloqueio. PDF (`application/pdf`) e vídeo (`video/mp4`,
`video/webm`) já têm limite reservado no código (20MB e 100MB), mas ficam
desabilitados até existir um fluxo de verdade no produto que os use — hoje
vídeo no cadastro de imóvel é só link de embed (YouTube/Vimeo), não upload.

Cada upload passa por: extensão do nome do arquivo, MIME declarado pelo
navegador, assinatura real dos primeiros bytes do arquivo (magic bytes) e
tamanho — os três primeiros precisam ser consistentes entre si, e o nome
original do arquivo nunca é usado na chave salva no R2 (a chave é sempre
`{organizationId}/{pasta}/{uuid-gerado-no-servidor}.{extensão}`).

## Rate limiting e proteção contra abuso

Backend: **Upstash Redis** (REST, sem conexão TCP persistente — funciona
igual com uma instância ou com várias, sem estado local). Comparado com as
outras opções antes de escolher:

| Opção | Por quê (não) |
|---|---|
| Cloudflare Rate Limiting/WAF | Não disponível hoje: a app roda em `*.ondigitalocean.app`, sem domínio próprio numa zona Cloudflare que dê pra configurar. Revisitar quando houver domínio próprio via Cloudflare. |
| **Upstash Redis** ✅ | Escolhido. HTTP-based, sem estado local, free tier generoso pra esse volume de tráfego. |
| Redis gerenciado (ex: DO Managed Redis) | Funcionaria, mas custo fixo (~US$15/mês) sem free tier, sem vantagem técnica sobre a Upstash nessa escala. |
| Contadores no Postgres (Neon) | Só cogitado se nenhuma das anteriores fosse viável — evitado por somar carga/latência extra no banco principal a cada tentativa de login/formulário/upload. |

Preencha `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` no `.env` —
sem essas variáveis o rate limiting fica **desativado** (fail-open: nada é
bloqueado, um aviso aparece no console), o resto do sistema funciona
normalmente.

### Resolução de IP

A app roda atrás do Cloudflare da própria DigitalOcean (não uma conta que
dá pra configurar) + o load balancer da DO. Documentação oficial da DO
confirma que, no App Platform, **`x-forwarded-for` contém o IP do
ingress da própria DO, não o do cliente** — por isso o único header
confiável aqui é `do-connecting-ip` (injetado pelo ingress da DO,
impossível de forjar pelo cliente). `x-forwarded-for` só é usado como
fallback de última instância (ex: rodando localmente atrás de outro
proxy). Ver `src/lib/client-ip.ts`.

### Limites (`src/lib/rate-limit.ts`)

| Onde | Dimensões | Limite |
|---|---|---|
| Login | IP e e-mail normalizado | 5 tentativas / 5 min; bloqueio progressivo (5min → 15min → 1h → 24h) a cada novo estouro |
| Contato / Anuncie | IP, organização e telefone/e-mail normalizado | 5 envios / 15 min **e** 20 / dia, em cada dimensão |
| Upload | Usuário (membro) e organização | 30 / 10 min por usuário; 100 / 10 min por organização |

Contato/anuncie também têm honeypot (campo invisível — se preenchido,
finge sucesso sem gravar nada) e rejeitam envios em menos de 1.5s desde o
formulário renderizar. O limite de mídia por plano (`entitlements.ts`)
continua existindo à parte — isso aqui é só "não mais que N envios por
janela de tempo".

Login e upload devolvem `429` com header `Retry-After`. Contato/anuncie
são Server Actions — Next.js não permite Server Action definir status
HTTP customizado (ver `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`,
seção "Rate limiting" — o próprio exemplo oficial usa Route Handler) —
por isso esses dois retornam a mesma mensagem de erro genérica de sempre,
sem 429 literal.

Eventos de abuso (bloqueio, honeypot, limite excedido) vão pra um log
estruturado no console (`src/lib/abuse-log.ts`), nunca pro `ActivityLog`
do banco — evita poluir a auditoria funcional com milhares de tentativas
bloqueadas sob ataque.

## Observabilidade (error tracking + logs)

### Sentry

Integração oficial: [`@sentry/nextjs`](https://www.npmjs.com/package/@sentry/nextjs)
(`peerDependencies.next` inclui `^16.0.0-0` — compatível, confirmado via
`npm view @sentry/nextjs peerDependencies`). Escrita manualmente, **sem
rodar o wizard** (`npx @sentry/wizard`) — o wizard cria `sentry.client.config.ts`
(convenção antiga, substituída aqui por `instrumentation-client.ts`, a
convenção do Next 15.3+/16), habilita Session Replay e o widget de
feedback por padrão (superfície de PII maior do que "error tracking"
pede) e cria páginas de exemplo públicas (`/sentry-example-page`). Nada
disso existe neste projeto — a rota de teste é protegida (ver abaixo) e
nenhuma das duas features foi habilitada.

**Sem `NEXT_PUBLIC_SENTRY_DSN`, a integração inteira vira no-op** — mesmo
padrão de "ausente = desligado, nada quebra" já usado pra R2/Resend/Upstash.

Arquivos:

| Arquivo | Runtime | O que cobre |
|---|---|---|
| `src/instrumentation-client.ts` | Browser | Erros de Client Component, navegação |
| `src/sentry.server.config.ts` | Node | Erros de Server Component, Route Handler, Server Action |
| `src/sentry.edge.config.ts` | Edge | `proxy.ts` e rotas `runtime: "edge"` |
| `src/instrumentation.ts` | Node + Edge | `register()` carrega o arquivo certo por `NEXT_RUNTIME`; `onRequestError` é o hook do próprio Next.js (não específico da Sentry) que dispara pra Server Component/Route Handler/Server Action/proxy — repassa pra `Sentry.captureRequestError` |
| `src/app/global-error.tsx` | Browser | Único caso que `onRequestError` não cobre: erro no próprio root layout |
| `src/lib/sentry-options.ts` | Compartilhado | Opções de `Sentry.init()` iguais nos três arquivos acima (uma fonte de verdade) |
| `src/lib/sentry-scrub.ts` | Compartilhado | `beforeSend`/`beforeSendTransaction` — toda a lógica de privacidade, ver abaixo |
| `next.config.ts` | Build | Envolvido em `withSentryConfig` — upload de source map + criação de release |

### Privacidade — o que nunca sai daqui

Duas camadas independentes (defesa em profundidade — se uma falhar, a
outra ainda barra):

**1. Coleta desligada na origem** (`dataCollection` em `sentry-options.ts`):
corpo de request/response (`httpBodies: []`), cookies (`cookies: false`),
headers de request/response (`httpHeaders: false`), dado automático de
usuário — IP/e-mail/username (`userInfo: false`) e **variáveis locais de
stack frame** (`stackFrameVariables: false` — o SDK captura isso por
padrão; sem desligar, uma Server Action com `senha`/`cpf`/`telefone` como
variável local anexaria esses valores literalmente ao evento).

**2. `beforeSend`/`beforeSendTransaction`** (`src/lib/sentry-scrub.ts`,
18 testes em `sentry-scrub.test.ts`) — roda mesmo assim, pro caso de algo
escapar da camada 1 (integração futura, campo novo do SDK):

| Dado | Tratamento |
|---|---|
| Senha, token, cookie, `Authorization`, mensagem/nota de texto livre | Removido por completo (`[filtrado]`), em qualquer chave cujo nome bata com o padrão (`senha`, `password`, `token`, `cookie`, `authorization`, `mensagem`, `notes`, `descricao`...), em qualquer profundidade de objeto |
| CPF | Removido por completo do texto livre (mensagem de erro, breadcrumb) — não existe "meio-CPF" seguro de mandar |
| Telefone | Mascarado — só os últimos 4 dígitos sobrevivem |
| E-mail | Mascarado — só a primeira letra do local-part + domínio (`j***@example.com`) |
| Query string | Mascarada seletivamente: chave sensível vira `[filtrado]`, mas `?page=2&sort=...` continua legível — não é um "apaga tudo" |
| `user` | Só `id` (técnico) sobrevive — `email`/`username`/`ip_address` são descartados mesmo que apareçam |
| Contexto customizado (`contexts`) | Mascarado, exceto os blocos técnicos do próprio SDK (`runtime`, `os`, `browser`, `app`, `device`, `trace`) |

### Contexto permitido

`organizationId` e `userId` são sempre os ids técnicos (cuid) — nunca
e-mail/nome. `route`, `action` (routeType do Next: render/route/action/proxy),
`modulo` (inferido automaticamente da rota em `instrumentation.ts` —
`crm`, `properties`, `users`, `upload`, `auth` etc.) e `release` (commit)
são anexados como **tags** (não `extra`), e só esses campos — `src/lib/logger.ts`
usa uma allowlist fixa, então mesmo que um call site passe algo a mais
como contexto, só os campos permitidos chegam à Sentry.

### Logger estruturado central (`src/lib/logger.ts`)

Substitui os `console.log`/`warn`/`error` que antes estavam espalhados
(upload, e-mail, ActivityLog, KV store, log de abuso — 9 pontos,
migrados). Quatro níveis (`debug`/`info`/`warn`/`error`); nível mínimo por
`LOG_LEVEL` (padrão: `debug` fora de produção, `info` em produção).

```ts
import { logger } from "@/lib/logger";

logger.info("imóvel criado", { organizationId, modulo: "properties" });
logger.error("falha ao enviar e-mail de contato", erro, { modulo: "email" });
```

**Sem duplicar com a Sentry, de propósito**: só `logger.error(...)`
encaminha pra Sentry (`Sentry.captureException`/`captureMessage`, com a
allowlist de contexto acima) — `debug`/`info`/`warn` ficam só no console
(capturado pelos logs da plataforma, mesmo padrão já usado em
`abuse-log.ts`). E `src/instrumentation.ts`, que já chama
`Sentry.captureRequestError` diretamente pra erro automático de rota, usa
`registrarErroJaReportado()` (não `logger.error()`) pra escrever a linha
estruturada sem mandar o mesmo erro à Sentry uma segunda vez.

`requestId`: quando existe uma trace ativa da Sentry na requisição, o
`traceId` dela é usado como `requestId` automaticamente na linha de log —
permite achar no console exatamente o log que corresponde a um evento
específico da Sentry, sem precisar de um sistema de correlação próprio.

### Release pelo commit + ambiente

`NEXT_PUBLIC_SENTRY_RELEASE` é usado em runtime (`Sentry.init({release})`,
nos três arquivos de instrumentação) **e** no build
(`withSentryConfig({release: {name: ...}})`, `next.config.ts`) — o mesmo
valor nos dois garante que o release do evento bate com o release do
source map. Em produção (DigitalOcean App Platform), configure como
`${_self.COMMIT_HASH}` — variável embutida da própria plataforma
(confirmado na documentação: disponível em build **e** runtime, para
services/static sites), não um valor digitado à mão.

`NEXT_PUBLIC_SENTRY_ENVIRONMENT` (`development`/`staging`/`production`) —
sem configurar, cai em `development`. Hoje o projeto só tem produção
(nenhuma organização de staging existe ainda); a variável já suporta os
três valores pra quando isso mudar, sem precisar de mudança de código.

### Source maps em produção, sem expor publicamente

`withSentryConfig` gera source map "hidden" (nunca linkado no bundle
servido ao navegador), faz upload pra Sentry no build e apaga do build de
saída depois (`deleteSourcemapsAfterUpload`, default do plugin) — dá pra
ler stack trace legível nos eventos sem publicar o mapa de código-fonte.
Isso só roda de verdade com `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`
configurados; sem eles (build local, CI da Fase 6), o plugin só avisa no
log e pula essa etapa — **o build não falha** (comportamento confirmado
lendo o código do plugin: ele checa `!options.authToken` e retorna com um
aviso, não lança erro). Configure essas três variáveis só no ambiente de
build real (a DigitalOcean) — nunca no CI, que usa valores de `.env.test`
sem nenhum segredo.

### Rota de teste (fora de produção, ou protegida por papel)

`GET /api/debug/sentry-check` — manda um evento de teste
(`Sentry.captureMessage`) e confirma no JSON de resposta se o DSN está
configurado. Com `?throw=1`, também lança uma exceção de propósito, pra
testar a captura automática (`onRequestError`).

Liberado sem restrição quando `NEXT_PUBLIC_SENTRY_ENVIRONMENT !== "production"`;
em produção, exige sessão com papel de gestão de configurações (`OWNER`/`ADMIN`
— mesmo critério já usado em outras áreas sensíveis do painel).

### Alertas mínimos recomendados (não configurados — documentado pra configurar direto no Sentry)

Não tenho acesso à conta/dashboard da Sentry pra criar isso — só
documentando as regras recomendadas (Sentry → Alerts → Create Alert Rule):

| Alerta | Condição sugerida | Por quê |
|---|---|---|
| Aumento de erros 500 | Nº de eventos de um issue > 10 em 5 min (ou Anomaly Detection da própria Sentry) | Pico repentino geralmente é regressão ou dependência externa fora do ar |
| Falha de upload | Qualquer issue novo com tag `modulo:upload` | Upload pro R2 falhando silenciosamente não aparece em nenhum outro lugar — não há métrica de negócio que capture isso |
| Falha de banco | Issue novo com tag `modulo:database`, ou tipo de exceção batendo com `PrismaClientKnownRequestError`/`PrismaClientInitializationError` | Erro de banco tende a virar cascata de outros erros rápido |
| Regressão após release | Feature nativa da Sentry: "Regression" (issue resolvido que reapareceu), associada ao `release` (commit) que estamos enviando | É exatamente o que a Sentry já faz automaticamente quando o release está configurado — só precisa ligar a notificação |

Canal de notificação (Slack/e-mail) fica a critério de quem configurar —
não presumido aqui.

## SEO técnico

### `robots.ts` (`src/app/robots.ts`)

Site público inteiro liberado (`Allow: /`); `Disallow: /app/` (painel
autenticado) e `Disallow: /api/` (inclui `/api/auth`, `/api/admin/*` e a
rota de teste da Sentry). `/_next/static` e `/_next/image` **não** entram
no disallow — são os assets que o próprio Googlebot precisa buscar pra
renderizar a página direito. Aponta pra `/sitemap.xml`.

### `sitemap.ts` (`src/app/sitemap.ts`)

| Regra | Como é aplicada |
|---|---|
| Home, listagem pública, imóveis disponíveis | `/`, `/imoveis`, `/vendidos`, `/anuncie`, `/contato` sempre incluídos; um `<url>` por imóvel com `status: "AVAILABLE"` |
| Excluir rascunho/vendido/alugado/inativo | `DRAFT`/`INACTIVE` nem são acessíveis publicamente (a página de detalhe devolve 404 pra esses); `SOLD`/`RENTED` são acessíveis (aparecem em `/vendidos`) mas ficam fora do sitemap de propósito — sem valor de busca, podem confundir quem chega do Google atrás de algo que já não está disponível. `RESERVED` também fica fora: nem a busca pública mostra imóvel reservado hoje (mesmo filtro de `imoveis/page.tsx`), não faria sentido um crawler achar uma URL que não aparece em nenhuma navegação normal |
| `lastModified` | `updatedAt` de verdade do imóvel (Prisma), não uma data fixa |
| URL correta por organização/tenant | Consulta sempre filtrada por `organizationId` (`getPublicOrganizationId()` + `withOrganization`) — testado ao vivo criando um imóvel numa segunda organização e confirmando que ele **não** aparece no sitemap da organização pública |
| Paginação se o volume crescer | Ver comentário em `sitemap.ts` — a query já está isolada num formato fácil de fatiar por `skip`/`take`, pronta pra virar `generateSitemaps()` quando o catálogo justificar |

**Achado ao testar** (por isso "testar" antes de declarar pronto importa):
a primeira versão usava `generateSitemaps()` desde já, preparando a
paginação. Rodando localmente (`curl -I http://localhost:3100/sitemap.xml`),
descobri que isso **muda a URL de `/sitemap.xml` pra `/sitemap/0.xml`**
mesmo quando só existe uma "página" — o próprio `robots.txt` (e a
expectativa padrão do Google) aponta pra `/sitemap.xml`, então isso
quebraria a URL convencional sem nenhum ganho real hoje. Corrigido pra um
`sitemap()` simples, sem `generateSitemaps()`, com a query já isolada
pra trocar quando o volume justificar (documentado no próprio arquivo).

### `metadataBase`, canonical, Open Graph, Twitter cards

`metadataBase` já existia em `src/app/layout.tsx` (usado pra resolver
todo `alternates.canonical`/`openGraph.url` relativo que as páginas
declaram). Cada página pública agora declara `alternates.canonical`
explícito — a de listagem (`/imoveis`) aponta sempre pra URL base, sem os
parâmetros de busca/filtro/página, pra evitar conteúdo duplicado no
Google entre as várias combinações de filtro que renderizam a mesma
"página" do ponto de vista de SEO. `src/lib/seo.ts` (`metadataPaginaPublica`)
centraliza title/description/canonical/OG/Twitter das páginas estáticas
(`/imoveis`, `/vendidos`, `/anuncie`, `/contato`) — sem isso, cada uma
herdaria o Open Graph genérico do layout raiz (nome do site + descrição
da home) em vez do próprio título/descrição ao ser compartilhada. A
página de imóvel (`/imoveis/[id]`) já tinha `generateMetadata` com OG/Twitter
por imóvel (foto de capa incluída) — só ganhou o `alternates.canonical`
que faltava.

## Headers de segurança

`src/lib/security-headers.ts` (usado por `next.config.ts` via `headers()`,
aplicado a todas as rotas — público e `/app` sob a mesma política, já que
o painel usa mapa/upload/Sentry também).

| Header | Valor | Observação |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Não vaza path/query completo pra origem cruzada, mantém referrer completo mesmo-origem |
| `Permissions-Policy` | camera/microphone/geolocation/payment/usb/gyroscope/magnetometer/accelerometer/interest-cohort desligados | Nenhum desses é usado — `navigator.clipboard` (usado em `GaleriaFotos.tsx`, "copiar link") não é restringido |
| `X-Frame-Options` | `DENY` | Junto com `frame-ancestors 'none'` na CSP — os dois, não um ou outro, pra cobrir navegador que não lê `frame-ancestors` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | **Só quando `NODE_ENV === "production"`** — nunca em dev (`http://localhost`) nem no build de teste do CI (`NODE_ENV=test`), que não têm HTTPS |
| `X-Powered-By` | removido | `poweredByHeader: false` no `next.config.ts` (opção nativa do Next — mais simples que tentar remover via `headers()`) |

### Content-Security-Policy — domínios mapeados

Todo domínio abaixo foi confirmado lendo o código (não presumido) — grep
por `fetch(`, `<iframe`, URL de imagem/tile e imports de biblioteca:

| Domínio | Diretiva | Por quê |
|---|---|---|
| `R2_PUBLIC_URL` (dinâmico) | `img-src` | Fotos/vídeos/plantas dos imóveis |
| `unpkg.com` | `img-src` | Ícone do marcador do Leaflet (`MapaLocalizacao.tsx`) |
| `*.tile.openstreetmap.org` | `img-src` | Tiles do mapa no cadastro/edição de imóvel |
| `viacep.com.br` | `connect-src` | Busca de endereço por CEP (`CamposEndereco.tsx`, client-side) |
| `servicodados.ibge.gov.br` | `connect-src` | Lista de municípios por UF (idem, client-side) |
| `*.sentry.io`, `*.ingest.sentry.io`, `*.ingest.us.sentry.io`, `*.ingest.de.sentry.io` | `connect-src` | Envio de evento de erro — sem DSN configurado ainda pra saber o subdomínio exato de ingest, então cobrindo os padrões conhecidos (global + regiões US/DE); revisar/apertar quando um DSN real existir |
| `www.google.com` | `frame-src` | Mapa embarcado (`iframe`) na página pública do imóvel |
| `www.youtube.com`, `player.vimeo.com` | `frame-src` | Vídeo do imóvel — campo de link de embed (`MediaUploader.tsx`: "link do YouTube/Vimeo") |
| Swiper (carrossel) | nenhum | Empacotado via `npm`/`import "swiper/css"`, servido same-origin — não precisa de domínio externo |
| Fontes (`next/font/google`) | nenhum (`font-src 'self'`) | `next/font` baixa e hospeda o arquivo da fonte no próprio build — nunca busca em `fonts.googleapis.com` em runtime |
| Resend | nenhum | Só server-side (o navegador nunca fala com a Resend) |
| Neon | nenhum | Só server-side via `DATABASE_URL`/Prisma — o navegador nunca conecta no banco |

### `unsafe-inline` / `unsafe-eval` — reduzidos, não eliminados (testado)

- **`style-src: 'unsafe-inline'`** — mantido. `style={{...}}` (atributo
  inline do React, não CSS-in-JS) aparece com valor dinâmico em vários
  componentes (`MapaLocalizacao.tsx`, `global-error.tsx`...) — não dá pra
  virar classe CSS estática sem reescrever esses componentes, fora do
  escopo desta fase.
- **`script-src: 'unsafe-inline'`** — mantido, **testado antes de
  decidir**: removi temporariamente, rodei os specs de Playwright contra
  a página pública e o painel, e a hidratação quebrou de verdade em toda
  página (`Executing inline script violates the following Content
  Security Policy directive 'script-src'...'unsafe-inline'...`) — o
  próprio Next.js injeta `<script>` inline pro streaming/hidratação do
  RSC. O jeito de eliminar isso é nonce via `proxy.ts`, mas isso **exige
  renderização dinâmica em toda página** (a doc oficial do Next é
  explícita sobre isso) — incompatível com as páginas hoje estáticas
  (`/`, `/anuncie`, `/contato`) sem reverter uma otimização de cache já
  existente. Registrado como o próximo passo de endurecimento, não feito
  aqui.
- **`script-src: 'unsafe-eval'`** — só fora de produção (`NODE_ENV !==
  "production"`). O modo de desenvolvimento do React usa `eval()` pra
  reconstruir stack trace; confirmado ao vivo (rodando sem essa
  concessão, o console mostrava "eval() is not supported in this
  environment... React will never use eval() in production mode" — a
  própria mensagem já confirma que produção não precisa). Ausente em
  produção.

### Enforced, não Report-Only — com evidência

A política já sai **bloqueante** (`Content-Security-Policy`, não
`-Report-Only`) porque foi testada antes de decidir, não por suposição:

1. Rodei a suíte completa de E2E (Playwright, os 9 specs de `tests/e2e/`
   — login, CRUD de imóvel, isolamento de tenant, bloqueio de módulo,
   formulário público, mobile) com os headers novos ativos: **9/9
   passando**, nenhuma regressão funcional.
2. Naveguei (via Playwright, com listener de console) por todas as
   páginas da lista de teste — públicas, login, admin, `/app/imoveis/novo`
   (mapa), imóvel com coordenadas (mapa Leaflet **e** embed do Google
   Maps), `/api/debug/sentry-check` — coletando qualquer mensagem de
   console batendo com `content security policy`/`refused to`: **zero
   violações** com a política final (`script-src`/`style-src` com
   `unsafe-inline`, os domínios da tabela acima).
3. O único cenário que de fato quebra (`script-src` sem `unsafe-inline`)
   foi identificado testando de propósito uma versão temporária mais
   restrita — não é a política que vai pro ar; serviu só pra confirmar
   que a concessão documentada acima é necessária, não um hábito.

Se o objetivo for chegar a uma CSP mais rígida no futuro (nonce, sem
`unsafe-inline` em `script-src`), o caminho já está mapeado no comentário
de `security-headers.ts`: proxy.ts gerando nonce por requisição + opt-in
de renderização dinâmica nas páginas hoje estáticas.

## Health check e documentação operacional

### `GET /api/health`

Público, sem autenticação, resposta mínima de propósito — nunca URL de
banco, nome interno, credencial ou stack trace:

```json
{ "status": "ok" }
```

`200` quando saudável, `503` quando a dependência crítica (PostgreSQL)
falha. Só checa aplicação + banco — R2 e Resend **não** são checados
aqui (chamada de rede cara em toda requisição pública seria um problema
de custo/latência, não só de design). Timeout curto (3s) via
`Promise.race` — ver `src/lib/health.ts`.

### `GET /api/admin/diagnostics`

Diagnóstico aprofundado: PostgreSQL + `HeadBucket` real no R2 + presença
de configuração da Resend (sem chamada de rede — a key configurada é
send-only, ver `docs/operations/secrets-rotation.md`). Mesmo critério de
acesso de `/api/debug/sentry-check` (Fase 7): livre fora de produção,
exige papel OWNER/ADMIN quando `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`.

Também disponível como script, pra execução manual sem precisar de sessão
HTTP:

```bash
npx tsx scripts/health-check-deep.ts
```

### Documentação operacional (`docs/operations/`)

| Runbook | Cobre |
|---|---|
| `production-checklist.md` | Checklist consolidado antes/depois de mudança de infra |
| `deployment-runbook.md` | Deploy na DigitalOcean, env vars, migrations em produção |
| `rollback-runbook.md` | Rollback de código, compatibilidade com migrations — **testado**: rollback pra antes da migration `rename_domain_to_english` contra o schema atual falha com `table does not exist`, confirmado rodando de verdade num `git worktree` isolado |
| `database-restore-runbook.md` | Restore do Postgres/Neon — **testado**: ciclo `pg_dump`/`pg_restore` completo localmente, contagens de linha conferidas |
| `r2-restore-runbook.md` | Recuperação de objeto no R2 — **testado**: ciclo put/get/delete confirmado; versionamento do bucket não pôde ser confirmado via API (token sem permissão de admin de bucket) — pendente de confirmação manual no painel |
| `incident-response.md` | Severidade, árvore de decisão, comunicação, post-mortem |
| `secrets-rotation.md` | Rotação de `AUTH_SECRET` (encerra sessões — sessão é JWT, confirmado em `auth.config.ts`), `DATABASE_URL`, R2, Resend |

Onde a resposta dependia de acesso que esta sessão não tinha (retenção de
backup da Neon, versionamento do bucket R2), os documentos dizem
explicitamente "A CONFIRMAR" em vez de presumir um valor — ver cada
runbook.

## Configuração de marca (branding)

Centralizada em `src/lib/site-config.ts`, lida a partir de variáveis de ambiente — pensada para facilitar reaproveitar esta mesma base em um futuro cliente sem mexer no código:
- `NEXT_PUBLIC_NOME_IMOBILIARIA`
- `NEXT_PUBLIC_WHATSAPP_NUMERO` (formato internacional, ex: `5511999998888`)
- `NEXT_PUBLIC_EMAIL_CONTATO`

## Testes

Pirâmide de testes com três camadas, todas contra um **banco de teste
separado** (nunca o de desenvolvimento nem produção — ver `.env.test`
abaixo):

| Camada | Ferramenta | Onde | O que cobre |
|---|---|---|---|
| Unitários | Vitest | `src/**/*.test.ts` | Lógica pura sem I/O: schemas Zod, normalização de telefone/CPF/e-mail, RBAC (`temPapel`), cálculo de limites de plano, helpers de upload/paginação/mapeamento de imóvel. |
| Integração | Vitest + Postgres real | `tests/integration/**/*.test.ts` | Isolamento por `organizationId`, limite de imóveis/usuários, módulo CRM x captura de lead, upload prefixado por organização, rate limiting. Usa fixtures em `src/test/fixtures.ts` (cria e limpa dados próprios a cada teste — seguro rodar em paralelo/qualquer ordem). |
| E2E | Playwright | `tests/e2e/**/*.spec.ts` | Fluxos de navegador de ponta a ponta: login, CRUD de imóvel, isolamento de tenant por URL, bloqueio de módulo por plano, formulário público, navegação em viewport mobile. Usa um seed determinístico e idempotente (`prisma/seed-e2e.ts`, duas organizações fixas: `e2e-org-a` com plano completo, `e2e-org-b` no plano básico sem CRM). |

**Por que Vitest + Playwright, e não Jest/Testing Library:** Vitest já
resolve TypeScript/ESM nativamente (sem config extra pra Next 16/React 19),
roda os testes existentes de `node:test` com uma API compatível, e tem
cobertura via V8 embutida — não há necessidade de Babel/ts-jest. Testing
Library **não foi instalada** nesta fase: nenhum teste atual precisa
renderizar um componente React isolado (a lógica que vale testar já está
extraída em funções puras, e os fluxos de UI de ponta a ponta são cobertos
pelo Playwright); fica fácil de adicionar quando houver um caso real.
Playwright foi escolhido por já ser referenciado na documentação
empacotada do Next 16 (`node_modules/next/dist/docs/`) e por só precisar
do Chromium instalado (`npx playwright install chromium --with-deps`) para
o escopo mínimo desta fase.

### `.env.test`

Commitado no repositório (convenção do próprio Next.js — ver
`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`,
seção "Test Environment Variables": `.env.test` deve ir pro repositório,
diferente de `.env.test.local`). Não contém nenhum segredo real — só
credenciais do Postgres local de teste e valores fixos:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Aponta pro banco `imoveis_test` (mesmo Postgres do `docker compose`, banco separado do `imoveis` de dev) |
| `AUTH_SECRET` | Valor fixo só pra testes — nunca reutilizar em produção |
| `ORG_SLUG`, `ORG_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_SENHA` | Organização A do seed de E2E |
| `PUBLIC_ORG_SLUG` | Organização que o site público resolve durante os testes (mesma Org A) |
| `R2_*`, `RESEND_*`, `UPSTASH_*` | Deixados vazios de propósito — nenhum teste deve chamar um serviço externo real; upload/e-mail/rate-limiting real ficam fora do escopo automatizado |

Um `vitest.setup.ts` carrega esse arquivo antes de qualquer import (via
`setupFiles`, já que o singleton do Prisma em `src/lib/prisma.ts` lê
`DATABASE_URL` uma única vez na primeira importação) e **lança um erro se
`DATABASE_URL` não contiver `_test`** — segunda camada de proteção, além da
convenção, contra rodar teste sem querer contra dev/produção.

### Rodando localmente

```bash
npm run test:unit        # só unitários, rápido, sem precisar do banco de teste
npm run test:integration # unitários + integração (cria/migra imoveis_test automaticamente)
npm run test             # mesma coisa que test:integration (inclui unitários por estarem no mesmo include)
npm run test:coverage    # test + relatório de cobertura (texto + HTML em coverage/)
npm run test:e2e         # Playwright — sobe o Next em modo teste (porta 3100) e roda os specs
```

`npm run test`/`test:integration`/`test:coverage` têm um hook `pretest*`
que roda `scripts/prepare-test-db.ts` (idempotente: cria o banco
`imoveis_test` se não existir e aplica migrations pendentes). `test:e2e`
faz o equivalente sozinho via `globalSetup` do Playwright, que também
recria o seed determinístico (`prisma/seed-e2e.ts`) antes de cada rodada.

Nenhum teste depende da ordem de execução: os de integração criam
organizações com slugs/e-mails únicos por execução e apagam tudo que
criam ao final (`src/test/fixtures.ts`); os de E2E usam `upsert`
determinístico com ids fixos, então rodar `test:e2e` várias vezes seguidas
sempre parte do mesmo estado.

### Cobertura

Meta aplicada só aos módulos críticos (regras de negócio/segurança), não
ao projeto inteiro — ver `coverage.include` em `vitest.config.ts`:
`authorization.ts`, `entitlements.ts`, `pagination.ts`, `rate-limit.ts`,
`upload-validation.ts`, `property-mapper.ts`, `telefone.ts`, `cpf.ts`,
`contato-schema.ts`, `client-ip.ts`, `listagens-admin-query.ts`. Limiares:
75% statements/funções/linhas, 65% branches — hoje o suite real passa bem
acima disso (~97%/95%/100%/99%); os limiares ficam deliberadamente abaixo
do estado atual pra não travar o CI por causa de código novo pouco
coberto, sem abrir mão de um piso mínimo.

### CI

Ver a seção [CI/CD](#cicd) abaixo — o pipeline real já está em
`.github/workflows/ci.yml`.

## CI/CD

### O que o workflow faz

`.github/workflows/ci.yml` roda em toda **pull request contra `main`** e
em todo **push direto a `main`**, em dois jobs:

1. **`verify`** — `checkout` → Node (versão de `.nvmrc`) → `npm ci` →
   `prisma generate` → `npx tsc --noEmit` → `npm run lint` → prepara o
   banco de teste (cria + aplica migrations) → roda o seed mínimo →
   `npm run test` (unitários + integração) → `npm run build`.
2. **`e2e`** — depende de `verify` (`needs`, só roda se o primeiro job
   passar — economiza minutos de CI numa PR já quebrada) → Playwright com
   cache de browser → os 9 specs de `tests/e2e/`.

Banco de teste: cada job sobe seu próprio Postgres **efêmero** como
[service container](https://docs.github.com/actions/using-containerized-services/about-service-containers)
(`postgres:16-alpine`, mesmas credenciais fixas do `docker-compose.yml`
local — não é segredo). Ele nunca aponta pra produção — `DATABASE_URL` de
produção não existe em lugar nenhum deste workflow. O container é
destruído automaticamente pelo runner ao final do job; não há passo de
teardown manual porque não é necessário.

### Segredos

**Nenhum GitHub Secret é necessário hoje.** Isso é uma consequência
deliberada da arquitetura da [Fase 5](#testes): R2/Resend/Upstash ficam
vazios em `.env.test` de propósito (fail-open — nenhum teste depende de um
serviço externo real), e `AUTH_SECRET`/credenciais do Postgres de teste
são valores fixos, não sensíveis, seguros pra commitar. O passo de build
também usa esses mesmos valores (`NODE_ENV: test`), então nem ele precisa
de segredo de produção.

Quando um segredo de verdade for necessário (ex: testar upload contra um
bucket R2 de staging, ou notificar um serviço externo no deploy), o padrão
a seguir é: cadastrar em **Settings → Secrets and variables → Actions** e
referenciar como `${{ secrets.NOME_DO_SEGREDO }}` — nunca como valor
literal no YAML, nunca em `run:`/`echo` que possa vazar no log.

### Segurança do workflow

- **Permissões mínimas**: `permissions: contents: read` no topo do
  arquivo — nenhum job escreve no repositório, comenta em PR ou precisa de
  escopo além de ler o código.
- **Actions fixadas por SHA de commit**, não por tag flutuante
  (`@main`/`@v4`), com o número de versão em comentário do lado — só
  actions oficiais da própria GitHub (`actions/checkout`,
  `actions/setup-node`, `actions/cache`, `actions/upload-artifact`), que é
  a prática recomendada pelo próprio [guia de hardening de Actions da
  GitHub](https://docs.github.com/actions/security-guides/security-hardening-for-github-actions)
  contra um autor da action trocar o conteúdo de uma tag depois do fato.
- **Nada roda com segredo de produção** — nem o build, nem os testes,
  nem o Playwright.
- Um `pull_request` de um fork só recebe o `GITHUB_TOKEN` padrão
  (somente leitura, por causa da permissão explícita acima) e nenhum
  secret — mesmo sem essa permissão explícita, PRs de fork já não recebem
  secrets do repositório por padrão no GitHub Actions.

### Deploy (DigitalOcean) — proposta, nada alterado ainda

**Como a integração funciona hoje** (a partir do que já está documentado
neste README — nenhuma mudança foi feita na configuração da DigitalOcean
nesta fase): a app roda na DigitalOcean App Platform, que tipicamente
observa a branch `main` via integração nativa com o GitHub e dispara *seu
próprio* build + deploy a cada `push` nela — esse gatilho é independente
do GitHub Actions. Ou seja, hoje, **nada impede um push quebrado (ou um
merge que pulou revisão) de chegar a `main` e a DigitalOcean fazer deploy
dele mesmo assim** — os dois sistemas não se falam.

**Como impedir isso, sem tocar na configuração da DigitalOcean:**
Habilitar a proteção de branch recomendada abaixo (PR obrigatório + este
CI obrigatório antes de poder mergear) já resolve o essencial: se `main`
só pode avançar através de um merge que exigiu `verify` e `e2e` verdes,
então todo `push` que chega em `main` — e que a DigitalOcean vai pegar —
já passou pelo CI. A DigitalOcean continua "burra" (só reage a push),
mas `main` nunca fica quebrada pra ela reagir a algo ruim.

**Alternativa mais rígida (proposta, não implementada nesta fase):**
desligar o auto-deploy por push da DigitalOcean e substituir por um job
de deploy dentro deste mesmo workflow, com `needs: [verify, e2e]`, que
chama a API/`doctl` da DigitalOcean só depois dos dois jobs passarem
(usando um `DIGITALOCEAN_ACCESS_TOKEN` como GitHub Secret). Isso fecha a
brecha que a proteção de branch sozinha não fecha: um admin que faz push
direto ignorando a proteção (se "Include administrators" não estiver
marcado) ou uma corrida entre um deploy manual e o CI. Mais seguro, mais
mudança — por isso fica proposto, não feito, até ser combinado.

**A DigitalOcean precisa esperar os status checks da branch?** Com a
proteção de branch recomendada (merge só com CI verde), a resposta curta
é: **não precisa, porque ela nunca vai ver um `push` em `main` que não
passou primeiro pelo CI** — a garantia já aconteceu antes, no merge. Só
passaria a precisar "esperar" ativamente se, no futuro, alguém reabilitar
push direto a `main` sem proteção, ou adotar a alternativa mais rígida
acima (aí sim o deploy some da DigitalOcean e vira um passo condicionado
explicitamente ao `needs` do workflow).

### Proteção de branch recomendada para `main`

Não aplicada automaticamente (exige acesso de admin ao repositório no
GitHub, fora do escopo do que dá pra fazer por aqui) — configurar em
**Settings → Branches → Branch protection rules → `main`**:

- ✅ **Require a pull request before merging** — nenhum push direto a
  `main`, toda mudança passa por PR.
- ✅ **Require status checks to pass before merging**, com os checks
  `verify` e `e2e` (nomes dos jobs de `.github/workflows/ci.yml`)
  marcados como obrigatórios.
- ✅ **Require branches to be up to date before merging** — evita
  mergear uma PR testada contra uma `main` antiga.
- ✅ **Do not allow bypassing the above settings** (a opção às vezes
  chamada de "Include administrators") — sem isso, um admin pode pular a
  proteção inteira; com ela marcada, ninguém consegue.

Nenhum desses passos foi aplicado por mim — só documentado, pra alguém
com acesso de admin ao repo aplicar quando decidir.

## Estrutura do projeto

```
.github/workflows/ci.yml  pipeline de CI (tipos, lint, testes, build, E2E)
src/instrumentation.ts, src/instrumentation-client.ts,
src/sentry.server.config.ts, src/sentry.edge.config.ts  Sentry (ver Observabilidade)
src/app/(public)/     site público (home, /imoveis, /imoveis/[id], /vendidos, /anuncie, /contato)
src/app/app/          painel administrativo, em /app (protegido por login)
src/app/api/          rotas de API (auth, upload de mídia, /api/health, /api/admin/diagnostics, /api/debug/sentry-check)
src/app/robots.ts, src/app/sitemap.ts  SEO técnico (ver seção SEO técnico)
src/components/       componentes de UI compartilhados
src/components/admin/ componentes específicos do painel admin
src/lib/              Prisma client, Auth.js, R2, formatação, config de marca, logger, scrub de PII da Sentry, security-headers.ts, seo.ts, health.ts
src/test/fixtures.ts  fábrica de dados pros testes de integração (org/usuário/imóvel + limpeza)
tests/integration/    testes de integração (Vitest + banco de teste real)
tests/e2e/            testes E2E (Playwright)
prisma/schema.prisma  modelo de dados
prisma/seed.ts        seed do usuário administrador inicial (dev/produção)
prisma/seed-e2e.ts    seed determinístico pros testes E2E
scripts/health-check-deep.ts  diagnóstico aprofundado por execução manual (ver Health check)
docs/operations/      runbooks operacionais (deploy, rollback, restore, incidentes, secrets)
```

## Comandos úteis

```bash
npm run dev           # servidor de desenvolvimento
npm run build         # build de produção
npm run lint          # lint
npm run test:unit     # testes unitários (Vitest, sem banco)
npm run test          # testes unitários + integração (Vitest, banco de teste)
npm run test:coverage # test + relatório de cobertura
npm run test:e2e      # testes E2E (Playwright)
npx prisma studio     # explorar o banco de dados visualmente
npx prisma migrate dev --name <nome>   # criar uma nova migration
```

Ver a seção [Testes](#testes) acima para detalhes de cada camada.

## O que já está implementado (v0)

- Site público: listagem de imóveis com filtros, página de detalhe (fotos/vídeos), página de vendidos/alugados, formulário de contato e "anuncie seu imóvel" (gravam leads no CRM).
- Painel admin: login, dashboard, CRUD de imóveis com upload de múltiplas fotos e vídeos (embed), controle de status (disponível/reservado/vendido/alugado/inativo) com histórico, CRM básico de clientes (funil, interações).

## Próximos passos (ver PRD.md, seções 11 e 13)

- Integração com os portais (ZAP, VivaReal, OLX, Imovelweb, Mercado Livre).
- Relatórios/dashboard mais completos por corretor/período.
- Identidade visual definitiva (ainda a criar).
- Deploy em produção (VPS + domínio já existente).
