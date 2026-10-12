# Auditoria da infraestrutura — Fase 116

**Método**: leitura direta do repositório (código, configuração, documentação de operações já existente). Nenhum acesso a painel externo (DigitalOcean, Neon, Resend, Upstash, Sentry) foi usado nesta auditoria — o que depende desses painéis está marcado **NÃO VERIFICADO** abaixo, nunca presumido.

| Componente | Estado | Evidência | Risco | Ação |
|---|---|---|---|---|
| Deploy | Confirmada | Push em `main` → deploy automático via integração nativa GitHub↔DigitalOcean App Platform; build roda `npm ci && npm run build` na própria DO (`docs/operations/deployment-runbook.md`) | Baixo | Nenhuma — mecanismo já documentado e usado em produção desde fases anteriores |
| Migrations em produção | Confirmada | Job de pre-deploy (`kind: PRE_DEPLOY`) roda `npx tsx scripts/migrate-deploy.ts` antes do novo código receber tráfego | Médio | Conteúdo exato do Job (`imob2`) só existe no painel DO — **NÃO VERIFICADO** nesta sessão (sem acesso a `doctl`/token) |
| Banco de produção | Confirmada | Neon (Postgres gerenciado), nunca Postgres da própria DO; `docker-compose.yml` só sobe Postgres local para dev | Baixo | Nenhuma |
| Plano Neon | **NÃO VERIFICADO** | Decisão registrada em fases anteriores de permanecer no plano Free; configuração real do projeto (tamanho, branch, allowlist de IP) não é visível pelo repositório | Médio | Confirmar no painel Neon antes de qualquer decisão de ambiente remoto (Parte B) |
| Domínio customizado | Confirmada ausência | `src/proxy.ts:85-90` e README confirmam por comentário explícito: nenhum domínio customizado está configurado em produção hoje; o mecanismo (`OrganizationDomain`) existe no código mas nunca foi ativado | Baixo | Nenhuma ação necessária para esta fase |
| HTTPS | Confirmada (domínio atual) | Gerenciado pela DigitalOcean App Platform para `*.ondigitalocean.app` | Baixo | Um domínio novo exigiria certificado próprio — não aplicável, nenhum domínio novo está sendo criado |
| Autenticação `/app` | Confirmada | NextAuth v5, `session: { strategy: "jwt" }`, provider Credentials com bcrypt, rate limiting de login (5 tentativas/5min, bloqueio progressivo) — `src/lib/auth.config.ts`, `src/lib/auth.ts` | Baixo | Nenhuma — mesmo mecanismo usado por toda a produção |
| Autenticação `/platform` | Confirmada | Instância NextAuth **separada**, secret próprio (`PLATFORM_AUTH_SECRET`), cookies com prefixo `platform-*`, rate limit mais restritivo (3 tentativas), `requirePlatformOperator()` revalida `active` no banco a cada chamada | Baixo | Nenhuma |
| Cookies de sessão | Confirmada | `httpOnly: true`, `sameSite: "lax"`, `secure` condicionado a `NODE_ENV === "production"` em ambas as instâncias | Baixo | Nenhuma |
| Isolamento multi-tenant | Confirmada | Extensão do Prisma Client (`src/lib/prisma.ts`) injeta/exige `organizationId` em todo model tenant-scoped; falha fechada (lança erro) se não houver escopo resolvível | Baixo | Nenhuma — mecanismo já validado extensivamente por testes automatizados ao longo do produto |
| CORS | Não aplicável | Aplicação é same-origin (Server Actions + Route Handlers do próprio Next); nenhuma política de CORS customizada foi encontrada nem é necessária para o uso atual | — | — |
| Security headers | Confirmada | CSP, `X-Frame-Options: DENY`, HSTS (produção), `Permissions-Policy`, `X-Content-Type-Options` — `src/lib/security-headers.ts`, aplicado via `next.config.ts` | Baixo | Nenhuma |
| Rate limiting | Confirmada (com ressalva) | Upstash Redis via REST, cobre login, contato, upload, cadastro, recuperação de senha (`src/lib/rate-limit.ts`) | Médio | **Fail-open documentado**: sem `UPSTASH_REDIS_REST_URL`/`TOKEN`, o rate limiting fica desativado silenciosamente (só loga aviso). Confirmar que essas variáveis estão configuradas em qualquer ambiente remoto antes de abrir acesso externo |
| Logs / monitoramento | Confirmada | Sentry (`@sentry/nextjs`) com scrubbing de PII documentado e testado (`src/lib/sentry-scrub.ts`, 18 testes); vira no-op sem `NEXT_PUBLIC_SENTRY_DSN` | Baixo | Confirmar DSN configurado em qualquer ambiente remoto |
| Migrations (schema) | Confirmada | 76 diretórios em `prisma/migrations/`, histórico aditivo, mais recente `20261012003640_add_plan_description` | Baixo | Nenhuma |
| Seed de demonstração (Fase 115) | Confirmada | `prisma/seed-demo.ts` — guarda dupla fail-closed (exige `DEMO_SEED_CONFIRM` literal + classifica a `DATABASE_URL` de destino por regex local/remoto, exigindo `DEMO_SEED_ALLOW_REMOTE` para qualquer banco que não pareça local), nunca deleta, dados 100% sintéticos | Baixo | Reaproveitado sem alteração nesta fase — ver `03-plano-implantacao.md` |
| Ambiente de demonstração local (Fase 115) | Confirmada | Preservado integralmente; nenhuma alteração nesta fase no seed, nos dados ou no procedimento documentados em `docs/comercial/demo/` | Baixo | Nenhuma |
| Envio de e-mail real (Resend) | Confirmada | `src/lib/email.ts` chama `resend.emails.send(...)` de verdade em 5 fluxos (contato, convites, recuperação de senha, cadastro de imobiliária); sem `RESEND_API_KEY`/`RESEND_FROM_EMAIL`, a função apenas retorna `enviado: false` com log de aviso | **Alto para ambiente remoto** | Ver `04-checklist-seguranca.md` — qualquer ambiente remoto de demonstração NÃO deve reaproveitar as credenciais de Resend de produção |
| WhatsApp | Confirmada como seguro | Todo o código (`src/lib/whatsapp.ts`, `src/lib/plataforma-suporte.ts`) só gera um link `wa.me/...` para um humano abrir e enviar manualmente — nenhuma chamada a API do WhatsApp Business/Cloud em lugar nenhum do repositório | Baixo | Nenhuma |
| Publicação de anúncio de imóvel | Confirmada como seguro | Geração de imagem 100% local/server-side (`sharp`); nenhuma chamada a API de Instagram/Facebook/Meta Ads | Baixo | Nenhuma |
| Webhooks externos | Confirmada ausência | Nenhuma chamada outbound a endpoint de terceiros além de R2, Sentry, ViaCEP e IBGE (todos já cobertos pela CSP existente) | Baixo | Nenhuma |
| robots.txt / sitemap | Confirmada | `src/app/robots.ts` bloqueia `/app/`, `/platform/`, `/api/`; `src/app/sitemap.ts` só lista páginas por organização, com salvaguarda explícita contra host desconhecido (sitemap vazio) | Baixo | Nenhuma |

## Pontos explicitamente NÃO VERIFICADOS (exigem acesso a painel externo)

- Conteúdo real do Job de pre-deploy `imob2` na DigitalOcean.
- Se o `Host` chega intacto ao processo Node em caso de domínio customizado futuro (o código assume isso mas nunca foi testado contra infraestrutura real).
- Plano/configuração real do projeto Neon (tamanho, branch, allowlist).
- Se as variáveis de produção (`RESEND_API_KEY`, `UPSTASH_REDIS_REST_*`, `NEXT_PUBLIC_SENTRY_DSN`) estão de fato configuradas hoje no painel da DO — o repositório só documenta o checklist esperado, não o estado real.
- Existência de qualquer ambiente remoto além de produção — não há evidência no repositório de um staging já existente.
