# Relatório de validação — Fase 116

## Testes técnicos executados

| Gate | Comando | Resultado |
|---|---|---|
| TypeScript | `npx tsc --noEmit -p .` | Aprovado, sem erros |
| ESLint (repositório completo) | `npm run lint` | Aprovado, sem avisos |
| Testes unitários/integração | `npm run test` (`vitest run`) | **3724 testes, 188 arquivos — todos aprovados** |
| Build de produção | `npm run build` | Aprovado — nova rota `/sistema-imobiliario` compilada como `ƒ` (dinâmica), sem erro de bundling client/server |
| Playwright (E2E completo) | `npm run test:e2e` | **1496/1497 aprovados.** A única falha (`pipeline.spec.ts:16`) é o flake de concorrência sob carga completa já documentado em fases anteriores — confirmado reexecutando a spec isolada (`npx playwright test tests/e2e/pipeline.spec.ts -g "KPIs renderizam"`), que passou sem alteração de código |
| Git/CI | push + `gh run view` | Commit `2120612`, run `38258640635`, `headSha` conferido, `conclusion: success` |
| Smoke de produção | `curl` contra `https://imob-f4vb3.ondigitalocean.app` | Ver seção abaixo |

## Verificação específica do REM-001 (separação client/server)

Reconfirmado o gate que já havia pego um bug real na Fase 112: nenhum módulo que importa `@/lib/prisma` é importado por um Client Component. A nova página (`src/app/sistema-imobiliario/page.tsx`) é um Server Component assíncrono que importa `@/lib/plataforma-suporte-dados` (server-only, já existente) — build concluído sem o erro "Module not found: Can't resolve 'tls'" que ocorreu na Fase 112.

## Defeito real encontrado e corrigido nesta fase

**Sintoma**: a nova página `/sistema-imobiliario` foi inicialmente prerenderizada como **estática** pelo Next (marcada `○` no output de build), porque não usa `params`/`cookies`/`headers` que forcem renderização dinâmica.

**Impacto se não corrigido**: o telefone de suporte (lido de `PlatformSettings` em tempo de build) ficaria congelado no HTML gerado — uma troca feita depois pelo Super Admin em `/platform/configuracoes` só apareceria na próxima vez que a aplicação fosse reconstruída/implantada, não imediatamente.

**Correção**: adicionado `export const dynamic = "force-dynamic"` à página, forçando leitura fresca do banco a cada requisição. Confirmado após a correção: a rota passou a aparecer como `ƒ` (dinâmica) no output de `npm run build`.

## Verificação funcional manual

- `curl` local contra `/sistema-imobiliario` (servidor de desenvolvimento): HTTP 200, `<title>` correto (`Sistema Imobiliário — CRM para imobiliárias`, sem o sufixo de nenhuma organização — corrigido com `title: { absolute: ... }` depois de identificado que o template do layout raiz aplicaria o sufixo "| Imobiliária" por padrão), meta `robots: noindex, nofollow` presente no HTML servido.
- Com `PlatformSettings` vazio (estado real do banco local, sem nenhum Super Admin ter configurado o telefone ainda): a seção de contato mostra corretamente a mensagem de fallback ("Canal de contato ainda não configurado"), sem gerar um link `wa.me` quebrado — comportamento correto confirmado por leitura do HTML servido.
- O caminho "telefone configurado" (botão de WhatsApp com mensagem pré-preenchida) não foi exercido contra um banco real nesta verificação, porque preencher `PlatformSettings` exigiria manipular a `DATABASE_URL` local fora do que as permissões desta sessão autorizam diretamente — a lógica reaproveita `linkWhatsAppSuporte`/`normalizarTelefoneSuporte`, já cobertos por 7 testes de integração existentes desde a Fase 112, e o parâmetro novo (mensagem opcional) é um repasse direto para `linkWhatsApp`, também já testado. Verificação por leitura de código e por tipo (TypeScript), não por execução ponta a ponta — limitação registrada explicitamente.

## Smoke de produção (pós-deploy, commit `2120612`)

Executado contra `https://imob-f4vb3.ondigitalocean.app` (URL informada pelo proprietário nesta sessão — não estava disponível no repositório, só na configuração da própria DigitalOcean):

| Verificação | Resultado |
|---|---|
| `GET /` | HTTP 200 |
| `GET /api/health` | `{"status":"ok"}` |
| `GET /robots.txt` | HTTP 200, confirma `Disallow: /app/`, `/platform/`, `/api/`, sem menção a `/sistema-imobiliario` |
| `GET /sitemap.xml` | HTTP 200, confirmado por grep: **zero ocorrências** de `sistema-imobiliario` — a landing nova não está listada |
| `GET /sistema-imobiliario` | HTTP 200; `<title>Sistema Imobiliário — CRM para imobiliárias</title>` (sem sufixo de organização); `<meta name="robots" content="noindex, nofollow">` presente no HTML servido |
| `GET /imoveis`, `GET /politica-de-privacidade` (rotas públicas existentes, regressão) | HTTP 200 nos dois — nenhuma rota pública pré-existente foi afetada |

Confirma em produção real exatamente o comportamento esperado: a nova página está no ar, responde corretamente, e permanece não indexada/não divulgada/não linkada, sem efeito colateral nas rotas públicas já existentes.

## Limitações desta verificação

- Não houve acesso a nenhum painel externo (DigitalOcean, Neon, Resend, Upstash, Sentry) — tudo o que depende disso está marcado "NÃO VERIFICADO" nos documentos desta fase, nunca presumido como confirmado.
- Nenhum ambiente remoto foi de fato implantado — a Alternativa B é arquitetura e procedimento, não execução.
- A landing institucional não teve uma auditoria formal de performance (Lighthouse) ou acessibilidade além do reaproveitamento dos mesmos componentes de UI já usados (e já maduros) no restante do produto.
