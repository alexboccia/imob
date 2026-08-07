# Runbook — Deployment (DigitalOcean App Platform)

## 1. Como o deploy acontece hoje

- **Gatilho**: push em `main` (integração nativa GitHub da DigitalOcean
  App Platform) — auto-deploy, sem passo manual pra disparar (ver
  README, seção CI/CD, e `docs/operations/rollback-runbook.md`).
- **CI (GitHub Actions)** roda **em paralelo**, não bloqueia o deploy da
  DO por si só — a proteção real vem de branch protection em `main`
  (checks `verify`/`e2e` obrigatórios antes de merge, ver README seção
  CI/CD). Ou seja: o que impede código quebrado de chegar a produção é
  nunca deixar `main` avançar sem CI verde, não a DO esperando o CI.
- **Build**: a própria DO builda a partir do source (`npm ci` + `npm run
  build`), independente do build que o GitHub Actions já validou.

## 2. Variáveis de ambiente de produção — checklist de presença

Confirmar que **todas** estão configuradas no painel da DO (App →
Settings → App-Level Environment Variables) antes do primeiro deploy ou
após qualquer mudança de infraestrutura. Lista completa e o que cada uma
faz está em `.env.example` — aqui só o que é **crítico pra aplicação
subir** (sem isso, o health check falha ou a aplicação não funciona):

| Variável | Crítica? | Observação |
|---|---|---|
| `DATABASE_URL` | Sim | Neon — sem isso, `/api/health` fica 503 |
| `AUTH_SECRET` | Sim | Forte, único de produção — nunca reaproveitar o de dev/teste |
| `NEXT_PUBLIC_SITE_URL` | Sim | Usado em `metadataBase`, sitemap, Open Graph |
| `PUBLIC_ORG_SLUG` / `ORG_SLUG` | Sim | Resolve a organização do site público |
| `R2_*` (5 variáveis) | Não crítica pro health check, mas necessária pra upload funcionar | Ver `r2-restore-runbook.md` |
| `RESEND_*` | Não crítica pro health check | E-mail de contato falha silenciosamente sem isso (ver README, `src/lib/email.ts`) |
| `UPSTASH_REDIS_REST_*` | Não | Sem isso, rate limiting fica desligado (fail-open) — funciona, mas sem proteção contra abuso |
| `NEXT_PUBLIC_SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` + `NEXT_PUBLIC_SENTRY_RELEASE` (`${_self.COMMIT_HASH}`) | Não crítica pro health check, crítica pra observabilidade | Ver README, seção Observabilidade |
| `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` | Não | Sem isso, build funciona mas sem upload de source map (ver README) |

## 3. Migrations em produção — **confirmar a configuração atual antes de assumir**

Este repositório **não tem** um arquivo `.do/app.yaml` versionado (a app
é configurada direto no painel da DO, não via IaC) — então não dá pra
confirmar por aqui, lendo código, se existe um passo automático de
`prisma migrate deploy` configurado no pipeline de build/deploy da DO
(via "Run Command" customizado, ou um Job component separado) ou se isso
é feito manualmente hoje.

**Ação recomendada**: confirmar no painel da DO (App → Settings →
Components → Run Command) se `prisma migrate deploy` já faz parte do
comando de start/build. Preencher:

| Campo | Valor | Confirmado por | Data |
|---|---|---|---|
| Migrations aplicadas automaticamente no deploy? | **A CONFIRMAR** | | |
| Se sim, onde está configurado (Run Command / Job) | **A CONFIRMAR** | | |

**Se NÃO estiver automatizado**, o passo manual, sempre **antes** de
considerar um deploy concluído quando ele inclui migration nova:

```bash
# Contra a DATABASE_URL de produção — nunca contra dev/teste
npx prisma migrate status   # confirma o que está pendente
npx prisma migrate deploy   # aplica só migrations pendentes, idempotente
```

`prisma migrate deploy` (diferente de `migrate dev`) nunca tenta gerar
migration nova nem perguntar nada interativamente — seguro de rodar em
CI/produção. Mesmo assim, **rodar sempre depois de revisar o
`migration.sql`** gerado localmente (ver seção 4 do
`rollback-runbook.md` sobre migrations destrutivas) — nada aqui
substitui essa revisão.

## 4. Sequência recomendada de deploy com migration

Pra minimizar a janela em que código novo e schema antigo (ou
vice-versa) coexistem:

1. Migration **aditiva** primeiro, código que a usa depois (dois
   deploys, não um só) — o código antigo continua funcionando contra o
   schema com a coluna nova (que ele ignora) enquanto o deploy do código
   novo não chega.
2. Se a migration for destrutiva (rename/drop) — ver
   `rollback-runbook.md` seção 2 antes de prosseguir; geralmente exige
   uma migration intermediária (dupla-escrita, ou view de compatibilidade)
   se não for possível ter uma janela de manutenção.
3. Confirmar `npx prisma migrate status` mostra "Database schema is
   up to date" antes de considerar o deploy concluído.

## 5. Verificação pós-deploy

1. `curl -s https://<domínio>/api/health` → esperar `{"status":"ok"}`
   com `200`.
2. Se o deploy incluiu mudança em R2/Resend/banco: rodar o diagnóstico
   protegido (`GET /api/admin/diagnostics`, autenticado como
   OWNER/ADMIN) ou `npx tsx scripts/health-check-deep.ts` (com
   `DATABASE_URL`/`R2_*`/`RESEND_*` de produção exportados no ambiente —
   nunca commitados).
3. Checar a Sentry (se `NEXT_PUBLIC_SENTRY_DSN` estiver configurado) por
   um pico de erro nos minutos seguintes ao deploy — ver alertas
   documentados no README, seção Observabilidade.
4. Smoke test manual: login, criar/editar um imóvel, ver o site público.

## 6. Se algo der errado após o deploy

Ver `rollback-runbook.md` — decisão entre forward fix e rollback depende
se houve migration destrutiva desde a última versão boa conhecida.

## 7. Checklist rápido de execução

- [ ] Todas as env vars da seção 2 confirmadas presentes (primeira vez
      ou após mudança de infraestrutura).
- [ ] `migration.sql` de qualquer migration nova revisado antes do merge
      (procurando `DROP`/`RENAME`/`ALTER ... TYPE`).
- [ ] `prisma migrate status` limpo após o deploy (automatizado ou manual).
- [ ] `/api/health` retornando `200`.
- [ ] Smoke test manual do fluxo crítico afetado pela mudança.
- [ ] Sentry sem pico de erro nos minutos seguintes.
