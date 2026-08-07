# Runbook — Rollback de código (DigitalOcean App Platform)

## 1. Como funciona o rollback na DigitalOcean

A DigitalOcean App Platform mantém um **histórico de deployments** por
app. Em **Apps → [nome do app] → Activity/Deployments**, cada deployment
passado tem opção de **reimplantar** (redeploy) esse build anterior —
isso efetivamente é o rollback de código: a DO reconstrói/reaplica o
artefato daquele deployment específico, sem precisar de um novo `git
push`. Nomes exatos de botão podem mudar entre versões do painel —
confirmar na tela do app antes de agir num incidente real.

Duas formas de fazer o mesmo rollback:

1. **Pelo painel**: Deployments → escolher o deployment anterior (bom) →
   "Redeploy"/"Rollback" (nome exato a confirmar no painel atual).
2. **Por `doctl`** (CLI oficial): `doctl apps list-deployments <app-id>`
   pra listar, depois `doctl apps create-deployment <app-id> --force-rebuild`
   apontando pro commit desejado, ou usando o deployment ID anterior —
   comando exato depende da versão do `doctl`, confirmar `doctl apps
   create-deployment --help` antes de usar em produção.

Como o app está configurado pra auto-deploy a cada push em `main` (ver
README, seção CI/CD), o jeito mais direto e **auditável** de fazer
rollback de código é: **reverter o commit no Git e deixar o pipeline
normal (CI → push → auto-deploy) fazer o deploy do estado revertido**,
em vez de usar o botão de rollback do painel — mantém `main` e o
histórico de deployment da DO **consistentes** (o painel sempre reflete o
que está de fato em `main`). Usar o rollback do painel diretamente é
aceitável pra conter um incidente rapidamente, mas **deve ser seguido de
um `git revert` correspondente** assim que possível, senão o próximo push
em `main` desfaz o rollback silenciosamente.

```bash
# Reverter o(s) commit(s) problemático(s) — cria um commit novo, não
# reescreve histórico (git revert, nunca reset --hard numa branch
# compartilhada)
git revert <commit-do-problema>
git push origin main
# CI roda, e (com a proteção de branch recomendada em CI/CD aplicada) o
# push só passa se `verify` + `e2e` ficarem verdes — a própria DO então
# faz o deploy desse estado revertido.
```

## 2. Compatibilidade com migrations — a parte que realmente importa

Rollback de **código** sozinho é fácil. O que decide se ele é **seguro**
é o estado do **banco**: código antigo rodando contra um schema mais
novo.

### Regra prática

| Tipo de migration entre a versão nova e a versão alvo do rollback | Rollback de código é seguro? |
|---|---|
| Só **aditiva** (nova tabela, nova coluna **nullable** ou com `DEFAULT`, novo índice) | **Sim** — código antigo ignora o que não conhece |
| **Renomeou** coluna/tabela/enum | **Não** — código antigo referencia o nome antigo, que não existe mais |
| **Removeu** coluna/tabela | **Não** — dado já não existe, nem pra leitura |
| Adicionou `NOT NULL` sem `DEFAULT` em coluna existente | **Não**, se o código antigo faz `INSERT`/`UPDATE` sem esse campo — mesmo lendo, se o código antigo faz `SELECT *` isso costuma ser seguro, mas **checar caso a caso** |
| Mudou o **tipo** de uma coluna | Depende — checar se o tipo antigo e o novo são compatíveis na direção "código antigo lê valor novo" |

**Antes de reverter código pra antes de uma migration**, ler o
`migration.sql` correspondente em `prisma/migrations/<pasta>/migration.sql`
e procurar por `DROP COLUMN`, `DROP TABLE`, `RENAME`, `ALTER COLUMN ...
TYPE`, `SET NOT NULL` — qualquer um desses torna o rollback de código,
sozinho, inseguro.

### Exemplo real deste projeto — testado, não hipotético

A migration `20260806210000_rename_domain_to_english` renomeia
literalmente quase todo o schema (tabelas, colunas, enums) de português
pra inglês — `imoveis` → `properties`, `titulo` → `title`, etc. — e
também **remove** colunas antigas (`corretorResponsavelId`,
`corretorAtribuidoId`, `corretorId`, a antiga `caracteristicas`).

**Testei isso de verdade** (não é suposição): usando `git worktree` (sem
tocar no diretório de trabalho principal), gerei um Prisma Client a partir
do `schema.prisma` de **antes** dessa migration (commit `0a67907`, ainda
em português) e tentei rodar uma query contra o banco de teste **já
migrado** (schema em inglês). Resultado:

```
Invalid `prisma.imovel.findMany()` invocation
The table `public.imoveis` does not exist in the current database.
```

Ou seja: **rollback de código pra antes dessa migration, contra o banco
atual, quebra imediatamente** — não é um bug sutil, é uma tabela que
simplesmente não existe mais com esse nome. Esse é o exemplo concreto de
"migration não reversível" deste projeto.

## 3. Quando rollback de código é seguro

- Reverter um bug introduzido **sem** nenhuma migration nova desde a
  versão anterior — sempre seguro (mesmo schema).
- Reverter pra uma versão anterior a uma migration **puramente aditiva**
  — seguro; o código antigo simplesmente não usa a coluna/tabela nova.
- Reverter pra antes de uma migration que **renomeou ou removeu** algo —
  **não é seguro fazer só o rollback de código.**

## 4. Quando a migration NÃO é reversível — como agir

Se o rollback de código precisa ir além de uma migration destrutiva
(rename/drop), as opções são, em ordem de preferência:

1. **Forward fix, não rollback** — na prática, quase sempre a resposta
   certa: escrever e deployar uma correção pra frente (fix rápido do bug
   real) em vez de tentar voltar no tempo. Rollback de código através de
   uma migration destrutiva tende a ser mais arriscado que consertar pra
   frente.
2. **Rollback de código + rollback de dados juntos** — só se
   estritamente necessário: restaurar o banco (ver
   `database-restore-runbook.md`) pra um ponto **anterior** à migration
   destrutiva **e** fazer o rollback do código pra a versão
   correspondente. Isso descarta qualquer dado criado depois daquele
   ponto — decisão que exige aprovação explícita (ver
   `incident-response.md`), nunca uma execução solo.
3. **Migration de compatibilidade reversa** — pra casos onde perder dado
   novo não é aceitável: escrever uma migration nova que recria a
   coluna/tabela antiga como *view* ou *alias* temporário sobre o schema
   novo, permitindo o código antigo rodar em cima do schema novo sem
   perda de dado. Mais trabalho, usado só quando as opções 1 e 2 não
   servem.

## 5. Teste realizado nesta fase (ambiente não produtivo)

- **O quê**: gerar Prisma Client do schema pré-rename (`git worktree` no
  commit `0a67907`, sem tocar no working directory principal) e rodar
  contra o banco de teste (`imoveis_test`, já no schema pós-rename).
- **Onde**: banco de teste local (Docker), nunca produção.
- **Resultado**: falha confirmada e documentada na seção 2 — evidência
  real de que esse tipo de migration exige a estratégia da seção 4, não
  um rollback simples.
- **Limpeza**: worktree removido (`git worktree remove --force`), Prisma
  Client temporário apagado — nada do teste ficou no repositório.

## 6. Checklist rápido de execução

- [ ] Identifiquei exatamente quais migrations existem entre a versão
      atual e a versão alvo do rollback (`git log` nos commits de
      `prisma/migrations/`).
- [ ] Li cada `migration.sql` procurando `DROP`/`RENAME`/`ALTER ... TYPE`.
- [ ] Se só aditivas: rollback de código simples (seção 1) é seguro.
- [ ] Se destrutivas: decidi entre forward fix / restore conjunto /
      migration de compatibilidade (seção 4) — não fiz rollback de código
      sozinho.
- [ ] Revertido via `git revert` + push (não só o botão do painel da DO),
      pra manter `main` consistente com o que está no ar.
- [ ] Registrei a decisão e o motivo em `incident-response.md`.
