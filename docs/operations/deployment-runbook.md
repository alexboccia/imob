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
- **Migrations**: **não** fazem parte deste build/start hoje — ver seção
  3 (causa raiz confirmada por dois incidentes reais, e o que fazer a
  respeito).

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

## 3. Migrations em produção

### 3.1. Causa raiz confirmada (dois incidentes reais)

**Migrations NÃO são aplicadas automaticamente hoje.** Isto não é mais
"a confirmar" — foi comprovado na prática duas vezes: a feature de
rodapé (`OrganizationSettings.footerLogoUrl`/
`OrganizationBranding.footerAppearance`) e a de paleta automática
(`OrganizationBranding.customTheme`) foram publicadas com CI verde, e
nas duas vezes produção caiu com HTTP 500 em `/`, `/imoveis` e
`/contato` (mas `/api/health` continuou 200 — ver seção 5) até alguém
rodar `prisma migrate deploy` manualmente contra a `DATABASE_URL` de
produção.

**Mecanismo concreto**: este repositório não tem `.do/app.yaml`
versionado — a app é configurada direto no painel da DO. O Build Command
e o Run Command atuais (confirmados pelo comportamento observado, não
por leitura de um arquivo) são equivalentes a `npm ci && npm run build`
e `npm start` — **nenhum dos dois roda `prisma migrate deploy` em
nenhum ponto**. `npm run build` só compila a aplicação (`next build`);
`postinstall` só roda `prisma generate` (gera o client, não toca no
banco). A DigitalOcean App Platform builda e sobe a versão nova
imediatamente após o build — sem nenhum passo intermediário que espere o
schema do banco ficar compatível primeiro. Resultado: código novo em
produção, schema antigo, toda query que toca a coluna/tabela nova
quebra com `PrismaClientKnownRequestError` (P2022 — coluna inexistente).

### 3.2. Correção: script de release dedicado + Job component da DO

Criado `scripts/migrate-deploy.ts` — wrapper fixo em volta de `prisma
migrate deploy` (nunca `migrate dev`/`db push`/`migrate reset`; nunca
engole o código de saída; nunca imprime `DATABASE_URL`). Testado contra
um banco descartável local nos três cenários abaixo (ver detalhes do
teste no PR/commit que introduziu isto):

- **Schema atrasado** → detecta a migration pendente, aplica, sai 0.
- **Schema já em dia** (idempotência) → "No pending migrations to
  apply.", sai 0.
- **Migration quebrada** (fixture temporária, nunca commitada) → Prisma
  retorna erro (`P3018`), o wrapper sai `1` sem mascarar o erro.

**Ponto escolhido para rodar isto — mecanismo nativo da DO preferido,
não `prisma migrate deploy && npm start`**: a DigitalOcean App Platform
oferece um tipo de componente **Job** com `kind: PRE_DEPLOY`, que roda
**uma vez**, **antes** de qualquer instância da versão nova do serviço
web começar a receber tráfego — se o Job falhar (código de saída != 0),
a DO marca o deployment como falho e a versão **anterior** continua no
ar. Isso é exatamente a semântica pedida ("falha bloqueia release") e
evita dois problemas de colocar a migration dentro do Run Command do
próprio serviço web:

1. Rodaria de novo a cada restart/scale-out da instância, não só em
   deploys com migration nova — I/O e latência de boot desnecessários na
   maioria das vezes.
2. Uma falha ali tenderia a virar crash-loop do container em vez de um
   sinal limpo de "deployment falhou" que a DO possa agir sobre.

**Configuração necessária no painel da DO (requer acesso que esta sessão
não tem — ver limitação abaixo)**:

```bash
# 1. Puxar o spec REAL atual da app (nunca escrever um novo do zero —
#    um spec incompleto aplicado por cima do real derruba env vars,
#    domínios, tamanho de instância etc. que não estejam nele)
doctl apps spec get <app-id> > current-spec.yaml

# 2. Adicionar um componente jobs: ao spec puxado (mantendo tudo o mais
#    que já existe intacto):
```

```yaml
jobs:
  - name: migrate-deploy
    kind: PRE_DEPLOY
    github:
      repo: <owner>/<repo>
      branch: main
    envs:
      - key: DATABASE_URL
        scope: RUN_TIME
        type: SECRET
        value: ${db.DATABASE_URL} # ou a mesma referência já usada pelo serviço web
    build_command: npm ci
    run_command: npx tsx scripts/migrate-deploy.ts
```

```bash
# 3. Aplicar o spec atualizado
doctl apps update <app-id> --spec current-spec.yaml
```

**Limitação explícita**: esta sessão não tem acesso ao painel/API da
DigitalOcean (sem `doctl` autenticado, sem `DIGITALOCEAN_ACCESS_TOKEN`)
— não foi possível aplicar isto na infraestrutura real. Alguém com
acesso ao painel da DO precisa executar os 3 passos acima (ou o
equivalente pela UI: App → Settings → **Create Component → Job**, tipo
Pre-Deploy, mesmo Run Command). Até isso ser feito, **o passo manual
abaixo continua sendo obrigatório** em todo deploy com migration nova.

### 3.3. Passo manual (enquanto o Job da DO não estiver configurado)

```bash
# Contra a DATABASE_URL de produção — nunca contra dev/teste
npx prisma migrate status              # confirma o que está pendente
npx tsx scripts/migrate-deploy.ts      # aplica (mesmo wrapper do Job acima)
```

Rodar **sempre depois de revisar o `migration.sql`** gerado localmente
(ver seção 4 do `rollback-runbook.md` sobre migrations destrutivas) —
nada aqui substitui essa revisão. O CI agora também sinaliza (anotação
não-bloqueante, ver `.github/workflows/ci.yml` e
`scripts/check-latest-migration.ts`) quando a migration mais recente
contém `DROP`/`RENAME`/`ALTER COLUMN ... TYPE`/`SET NOT NULL`.

### 3.4. Concorrência e múltiplas instâncias

`prisma migrate deploy` grava um advisory lock no Postgres
(`_prisma_migrations`) antes de aplicar qualquer migration pendente —
duas execuções concorrentes contra o mesmo banco não aplicam a mesma
migration em duplicado. Ainda assim, a garantia real deste projeto **não
vem de contar com esse lock**: vem de rodar isto num Job dedicado que
executa uma única vez por deploy, antes de qualquer instância do serviço
web subir — nunca dentro do processo do serviço web em si (que rodaria a
cada instância/restart). Não foi possível confirmar via teste real
contra múltiplas instâncias simultâneas (exigiria acesso à
infraestrutura de produção) — a afirmação acima é sobre o mecanismo do
Prisma (documentado) e sobre o desenho da solução (uma única execução
por deploy), não uma medição direta em produção.

### 3.5. Migrations destrutivas — expand/contract

`prisma migrate deploy` sozinho não distingue migration aditiva de
destrutiva — ambas são "aplicadas com sucesso" da perspectiva dele. A
proteção real contra indisponibilidade nesse caso é de **processo**, já
documentada em `rollback-runbook.md` (seção 2): antes de mergear uma
migration que `DROP`a/renomeia coluna ou tabela, usar duas fases em vez
de uma:

1. **Expand**: migration aditiva primeiro (nova coluna/tabela, mantendo
   a antiga) — deploy só do schema, sem código que dependa dela ainda.
2. Deploy do código que passa a usar a coluna/tabela nova.
3. **Contract**: só depois de confirmar que nenhuma instância antiga
   ainda está no ar (nenhuma janela de rollback pendente), uma segunda
   migration remove o que ficou obsoleto.

Isso garante que código antigo e código novo sempre encontram um schema
que ambos entendem, mesmo durante a janela de rolling deploy.

### 3.6. Por que `/api/health` ficou 200 durante os dois incidentes

`GET /api/health` (`src/app/api/health/route.ts` +
`verificarSaudeBasica` em `src/lib/health.ts`) só executa `SELECT 1` —
confirma que a conexão com o Postgres está de pé, não que o **schema**
bate com o que o código espera. Nos dois incidentes reais, a conexão
sempre esteve saudável (só faltava uma coluna); por isso `/api/health`
nunca acusou o problema, só as rotas que de fato liam a coluna ausente.

**Decisão deliberada de não expandir o health check** pra também validar
schema: uma checagem de "a coluna X da migration mais recente existe?"
seria frágil (precisaria saber qual é "a mais recente" em runtime, ou
listar toda coluna que algum código depende — acopla o health check ao
histórico de migrations) e, mais importante, **não ataca a causa raiz**
— com o Job Pre-Deploy (seção 3.2) configurado, o schema já estará
correto antes de qualquer instância nova do serviço web sequer iniciar,
tornando esse tipo de detecção em runtime desnecessária. Prioridade foi
resolver a ausência de `migrate deploy` no pipeline, não compensar a
ausência dela com um health check mais esperto.

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
      (procurando `DROP`/`RENAME`/`ALTER ... TYPE` — CI anota
      automaticamente, mas não bloqueia, ver seção 3.3).
- [ ] Job Pre-Deploy da DO configurado (seção 3.2)? Se **não**, rodar o
      passo manual da seção 3.3 **antes** de considerar o deploy
      concluído — não presumir que a migration já foi aplicada.
- [ ] `prisma migrate status` limpo após o deploy (automatizado ou manual).
- [ ] `/api/health` retornando `200`.
- [ ] Smoke test manual do fluxo crítico afetado pela mudança.
- [ ] Sentry sem pico de erro nos minutos seguintes.
