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
- **Migrations**: aplicadas por um **Job de pre-deploy** da App Platform
  (`imob2`), que roda `npx tsx scripts/migrate-deploy.ts` contra o banco
  de produção antes de a versão nova entrar em serviço — ver seção 3.
  Isso **mudou**: até setembro/2026 não havia esse passo no pipeline, e
  foi essa ausência que causou os dois incidentes descritos na seção
  3.1.

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

### 3.1. Histórico — a causa raiz dos dois incidentes (já corrigida)

> **Esta seção é histórico.** A afirmação "migrations não são aplicadas
> automaticamente", que ficou aqui até setembro/2026, **não vale mais**:
> ver 3.2 para o pipeline atual. O registro fica porque explica por que
> o pipeline é como é.

Durante os incidentes, migrations não eram aplicadas por nenhuma etapa
do deploy. Isso foi comprovado na prática duas vezes: a feature de
rodapé (`OrganizationSettings.footerLogoUrl`/
`OrganizationBranding.footerAppearance`) e a de paleta automática
(`OrganizationBranding.customTheme`) foram publicadas com CI verde, e
nas duas vezes produção caiu com HTTP 500 em `/`, `/imoveis` e
`/contato` (mas `/api/health` continuou 200 — ver 3.6) até alguém
rodar `prisma migrate deploy` manualmente contra a `DATABASE_URL` de
produção.

**Mecanismo concreto (na época)**: este repositório não tem
`.do/app.yaml` versionado — a app é configurada direto no painel da DO.
O Build Command e o Run Command (confirmados pelo comportamento
observado, não por leitura de um arquivo) são equivalentes a `npm ci &&
npm run build` e `npm start` — **nenhum dos dois roda `prisma migrate
deploy`**, e naquele momento não havia nenhum outro componente que o
rodasse. `npm run build` só compila a aplicação (`next build`);
`postinstall` só roda `prisma generate` (gera o client, não toca no
banco). A DigitalOcean App Platform builda e sobe a versão nova
imediatamente após o build — sem nenhum passo intermediário que espere o
schema do banco ficar compatível primeiro. Resultado: código novo em
produção, schema antigo, toda query que toca a coluna/tabela nova
quebra com `PrismaClientKnownRequestError` (P2022 — coluna inexistente).

### 3.2. Pipeline atual: `scripts/migrate-deploy.ts` no Job de pre-deploy `imob2`

**É assim que migration chega a produção hoje.** Um push em `main`
dispara o deploy na App Platform, e antes de a versão nova entrar em
serviço a DO executa o Job de pre-deploy **`imob2`**, cujo comando é:

```bash
npx tsx scripts/migrate-deploy.ts
```

com a `DATABASE_URL` de produção vinda da configuração de ambiente da
própria DO. Nenhuma ação humana faz parte do caminho feliz — **não rode
migration à mão "por garantia"** (ver 3.3: fazer isso mascara falha do
pipeline em vez de revelá-la).

**O que é versionado e o que não é** — a distinção importa, porque só
metade disto pode ser auditada a partir deste repositório:

| Peça | Onde vive | Auditável aqui? |
|---|---|---|
| `scripts/migrate-deploy.ts` (o que roda) | Este repositório | **Sim** — leia o arquivo |
| Job `imob2`, seu `kind: PRE_DEPLOY` e seu run command | Painel da DigitalOcean | **Não** — não há spec versionado (ver 3.2.1) |
| `DATABASE_URL` de produção | Configuração de ambiente da DO | **Não**, e não deve ser — ver seção 7 |

#### 3.2.1. Evidência de que o Job roda de fato

A configuração do `imob2` não está versionada, então esta é a base
factual do que está escrito acima — observação operacional, não leitura
de arquivo:

- migration `20260909170000_add_property_presentation_material`
  registrada em `_prisma_migrations` com `finished_at`
  **2026-09-09T17:13:03Z**;
- o commit que a introduziu (`e141e37`) foi publicado em `main` por
  volta de **17:07Z**, e o CI daquele push terminou por volta de
  **17:16Z** — ou seja, a migration foi aplicada **dentro da janela do
  deploy**;
- ninguém a aplicou manualmente nessa janela (a única tentativa manual
  daquele dia, com outra credencial, sequer chegou a autenticar);
- `npx prisma migrate status` contra produção, depois disso: 56
  migrations, *"Database schema is up to date"*, com a tabela, o índice
  composto e as duas foreign keys presentes.

Isso **não** é uma leitura da configuração da DO: é a conclusão mais
simples compatível com os fatos acima, somada à informação do
responsável pelo ambiente de que o Job `imob2` existe e roda esse
comando. Se algum dia o spec da app passar a ser versionado (`doctl apps
spec get > .do/app.yaml`), esta seção deixa de depender de inferência.

Sobre o script em si — `scripts/migrate-deploy.ts` é um wrapper fixo em
volta de `prisma migrate deploy` (nunca `migrate dev`/`db push`/`migrate reset`; nunca
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

**Como o Job foi (e seria) configurado no painel da DO** — registrado
aqui para reconstrução (ex.: recriar a app, criar um ambiente de
staging). Não é um passo pendente:

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
  - name: imob2 # nome real do Job nesta app
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

**Limitação de auditoria que permanece**: uma sessão de
desenvolvimento não tem acesso ao painel/API da DigitalOcean (sem
`doctl` autenticado, sem `DIGITALOCEAN_ACCESS_TOKEN`), então **a
existência e o conteúdo do Job `imob2` não podem ser verificados a
partir daqui** — o que existe é a evidência operacional de 3.2.1 e a
informação de quem administra o ambiente. Versionar o spec
(`doctl apps spec get <app-id> > .do/app.yaml`) fecharia esse buraco.

### 3.3. O que fazer depois do deploy — e quando (não) rodar migration à mão

**O caminho normal não tem passo manual.** Depois de um deploy com
migration nova, a ordem é verificar, não reaplicar:

1. **Deploy/CI**: o deployment da DO terminou como bem-sucedido? O CI do
   commit está verde? (Um pre-deploy que falha derruba o deployment —
   ver 3.3.1.)
2. **SHA servido**: confirmar que produção está servindo o commit
   esperado — `NEXT_PUBLIC_SENTRY_RELEASE` aparece nos chunks JS
   (ver README, seção Observabilidade).
3. **Schema**, quando houver acesso autorizado ao banco:
   `npx prisma migrate status` → esperado *"Database schema is up to
   date"*.
4. **`_prisma_migrations`**, só se o passo 3 acusar algo ou se houver
   dúvida sobre QUANDO uma migration entrou: a coluna `finished_at` dá o
   instante da aplicação, que é o que permite cruzar com a janela do
   deploy (foi assim que 3.2.1 foi estabelecido).
5. **Aplicar à mão**: somente se o pre-deploy tiver falhado ou se houver
   evidência concreta de drift (migration pendente no passo 3, erro
   P2021/P2022 no Sentry, rota quebrada).

> **Não rode `migrate deploy` "por garantia".** É idempotente, então
> parece inofensivo — e é justamente por isso que faz mal: transforma
> "o pipeline aplicou" e "eu apliquei sem perceber que o pipeline não
> aplicou" no mesmo resultado observável, escondendo uma falha do
> `imob2` que deveria ter aparecido. Verificar revela; reaplicar às
> cegas encobre.

Quando o passo 5 for legítimo, o comando é o mesmo wrapper que o Job
usa, com a `DATABASE_URL` de produção **exportada no ambiente da sessão,
nunca escrita em arquivo do repositório**:

```bash
npx prisma migrate status              # o que está pendente, de fato
npx tsx scripts/migrate-deploy.ts      # aplica (mesmo wrapper do Job)
```

Antes disso, revisar o `migration.sql` (ver seção 4 do
`rollback-runbook.md` sobre migrations destrutivas) — nada aqui
substitui essa revisão. O CI também sinaliza (anotação não-bloqueante,
ver `.github/workflows/ci.yml` e `scripts/check-latest-migration.ts`)
quando a migration mais recente contém `DROP`/`RENAME`/`ALTER COLUMN ...
TYPE`/`SET NOT NULL`.

#### 3.3.1. Se o pre-deploy falhar

- **O deploy não é saudável.** Não trate a entrega como concluída
  enquanto schema e código estiverem divergentes — é exatamente o estado
  dos dois incidentes de 3.1.
- **Investigue o log do Job `imob2`** no painel da DO. O wrapper nunca
  engole código de saída e nunca mascara o erro do Prisma: o motivo real
  (P3018, falha de conexão, permissão) está no log.
- **Corrija pelo Git**, com uma migration nova ou revertendo o commit —
  nunca com DDL aplicado à mão em produção, que deixa o banco num estado
  que nenhuma migration descreve e que o próximo `migrate status`
  reprova.
- **Semântica de bloqueio — não confirmada neste projeto**: a
  documentação da DigitalOcean diz que um Job `PRE_DEPLOY` com saída
  != 0 faz o deployment falhar e mantém a versão anterior no ar. Isso
  **nunca foi observado aqui** (nenhum pre-deploy falhou até hoje).
  Enquanto não for observado, trate como risco em aberto: pode ser que
  uma falha de migration ainda deixe a versão nova subir contra um
  schema antigo. Ao ver um `imob2` vermelho, verifique você mesmo qual
  versão está sendo servida antes de concluir qualquer coisa.

### 3.4. Concorrência e múltiplas instâncias

`prisma migrate deploy` grava um advisory lock no Postgres
(`_prisma_migrations`) antes de aplicar qualquer migration pendente —
duas execuções concorrentes contra o mesmo banco não aplicam a mesma
migration em duplicado. Ainda assim, a garantia real deste projeto **não
vem de contar com esse lock**: vem de rodar isto no Job `imob2`, que
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
— com o Job de pre-deploy `imob2` (seção 3.2) no caminho, o schema já
está correto antes de qualquer instância nova do serviço web sequer
iniciar, tornando esse tipo de detecção em runtime desnecessária. A
prioridade foi resolver a ausência de `migrate deploy` no pipeline, não
compensar a ausência dela com um health check mais esperto.

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
   up to date" antes de considerar o deploy concluído — verificação,
   não reaplicação (ver 3.3).

## 5. Verificação pós-deploy

0. **Se o deploy incluiu migration**: seguir a ordem de 3.3 (deployment
   e CI → SHA servido → `migrate status` → `_prisma_migrations` só se
   necessário). Verificar, não reaplicar.
1. `curl -s https://<domínio>/api/health` → esperar `{"status":"ok"}`
   com `200`. Lembrar que isso **não** valida schema (ver 3.6): health
   verde com migration faltando foi exatamente o que aconteceu nos dois
   incidentes.
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

## 7. Credenciais de produção

- `DATABASE_URL` e todo secret de produção pertencem à **configuração de
  ambiente** (painel da DO para a aplicação e o Job `imob2`; painel da
  Neon para o banco). Não são versionados neste repositório e não devem
  ser.
- **Nunca** escreva uma connection string em documentação, log, mensagem
  de commit, arquivo do repositório ou saída de terminal — nem
  parcialmente, nem "mascarada". Quando um procedimento precisar dela,
  exporte-a no ambiente da sessão e refira-se a ela pelo nome da
  variável, como faz a seção 3.3.
- `scripts/migrate-deploy.ts` foi escrito com essa regra: repassa a
  variável ao processo filho e nunca a interpola em nenhuma string
  impressa.
- Credencial que tenha circulado fora do gerenciador de secrets (chat,
  e-mail, ticket, captura de tela) deve ser **rotacionada por quem
  administra o ambiente**, e a `DATABASE_URL` da aplicação e do Job
  atualizada na mesma janela — trocar a senha sem atualizar a
  configuração derruba a produção.

## 8. Checklist rápido de execução

- [ ] Todas as env vars da seção 2 confirmadas presentes (primeira vez
      ou após mudança de infraestrutura).
- [ ] `migration.sql` de qualquer migration nova revisado antes do merge
      (procurando `DROP`/`RENAME`/`ALTER ... TYPE` — CI anota
      automaticamente, mas não bloqueia, ver seção 3.3).
- [ ] Deployment da DO concluído com sucesso, incluindo o Job de
      pre-deploy `imob2` (é ele que aplica a migration — seção 3.2).
- [ ] `prisma migrate status` limpo após o deploy — como **verificação**;
      não reaplicar migration "por garantia" (seção 3.3).
- [ ] `/api/health` retornando `200`.
- [ ] Smoke test manual do fluxo crítico afetado pela mudança.
- [ ] Sentry sem pico de erro nos minutos seguintes.
