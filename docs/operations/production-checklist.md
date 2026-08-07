# Checklist de produção

Ponto de entrada dos `docs/operations/*` — cada seção linka pro runbook
correspondente quando existir. Usar antes do primeiro go-live e revisar
depois de qualquer mudança de infraestrutura relevante (troca de
provedor, novo secret, nova dependência externa).

## Infraestrutura e configuração

- [ ] Todas as variáveis de ambiente críticas configuradas na
      DigitalOcean (lista completa em `deployment-runbook.md`, seção 2).
- [ ] `AUTH_SECRET` de produção é único — nunca o mesmo valor usado em
      dev/`.env.test` (que são valores fixos e conhecidos, ver README
      seção Testes).
- [ ] `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` configurado (decide o
      gate de role em `/api/admin/diagnostics` e `/api/debug/sentry-check`
      — sem isso, essas rotas ficam abertas sem autenticação).
- [ ] `NEXT_PUBLIC_SENTRY_RELEASE` apontando pra `${_self.COMMIT_HASH}`
      (variável nativa da DO), não um valor fixo digitado à mão.

## Banco de dados (Neon)

- [ ] Plano, janela de PITR e responsável confirmados e registrados —
      ver `database-restore-runbook.md`, seção 1 (**não presumir**, a
      tabela lá está com "A CONFIRMAR" até alguém validar no painel).
- [ ] Procedimento de restore testado pelo menos uma vez (feito nesta
      fase, localmente — ver `database-restore-runbook.md`, seção 3;
      revalidar contra uma branch Neon de verdade quando houver acesso).
- [ ] `npx prisma migrate status` limpo em produção.
- [ ] Confirmado se migrations são aplicadas automaticamente no deploy
      ou manualmente — ver `deployment-runbook.md`, seção 3.

## Armazenamento de mídia (R2)

- [ ] Versionamento e lifecycle rules do bucket confirmados no painel
      Cloudflare — ver `r2-restore-runbook.md`, seção 1 (**não
      presumir**; testado programaticamente nesta fase e o resultado foi
      inconclusivo por escopo de permissão do token, não confirma nem
      desmente).
- [ ] Token R2 usado pela aplicação com escopo mínimo (Object Read &
      Write, não Admin) — confirmado nesta fase que é esse o caso hoje.
- [ ] Se versionamento estiver ativo: procedimento de recuperação de
      objeto testado em ambiente seguro (não em mídia real) — ver
      `r2-restore-runbook.md`, seção 3.

## Segurança

- [ ] Headers de segurança ativos e testados (`X-Content-Type-Options`,
      `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` +
      `frame-ancestors`, `Strict-Transport-Security` em produção, CSP
      enforced) — ver README, seção Headers de segurança.
- [ ] Proteção de branch em `main` aplicada no GitHub (PR obrigatório,
      CI obrigatório) — ver README, seção CI/CD (documentado mas exige
      acesso admin do GitHub pra aplicar, confirmar que foi feito).
- [ ] Rotas administrativas de diagnóstico (`/api/admin/diagnostics`,
      `/api/debug/sentry-check`) confirmadas exigindo papel
      OWNER/ADMIN em produção (dependem de
      `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` — ver item acima).
- [ ] Rotação de secret documentada e testada ao menos uma vez —
      ver `secrets-rotation.md`.

## Observabilidade

- [ ] Sentry recebendo evento de teste real (`GET
      /api/debug/sentry-check`, fora de produção ou como admin) — ver
      README.
- [ ] Alertas mínimos configurados no painel da Sentry — ver README,
      seção Observabilidade → Alertas mínimos recomendados (aumento de
      500, falha de upload, falha de banco, regressão após release).
- [ ] `GET /api/health` monitorado por um serviço externo (uptime
      monitor, ou o próprio health check da DO App Platform apontado
      pra essa rota) — **isso ainda não está configurado
      automaticamente por este projeto**, é um passo de infraestrutura a
      fazer no painel.

## SEO técnico

- [ ] `/robots.txt` e `/sitemap.xml` acessíveis e corretos em produção
      (ver README, seção SEO técnico).
- [ ] `NEXT_PUBLIC_SITE_URL` aponta pro domínio real de produção (usado
      em `metadataBase`, sitemap, Open Graph).

## Testes e CI

- [ ] `npm run test`, `npm run test:e2e`, `npx tsc --noEmit`, `npm run
      lint` e `npm run build` passando na branch `main` antes de
      qualquer deploy (garantido pela proteção de branch, se aplicada).

## Runbooks — todos revisados e com pelo menos um teste registrado

- [ ] `deployment-runbook.md`
- [ ] `rollback-runbook.md` — testado nesta fase (rollback de código
      contra migration destrutiva, ambiente isolado).
- [ ] `database-restore-runbook.md` — testado nesta fase (restore local).
- [ ] `r2-restore-runbook.md` — testado nesta fase (ciclo de objeto;
      versionamento pendente de confirmação manual).
- [ ] `incident-response.md`
- [ ] `secrets-rotation.md`

## Antes do primeiro go-live especificamente

- [ ] Seed inicial de produção rodado (`npx prisma db seed`, ou processo
      equivalente) com credencial de administrador real, **não** os
      valores de exemplo do `.env.example`.
- [ ] Confirmado que `.env.example` não contém nenhum valor real
      (só placeholders) antes de qualquer publicação do repositório.
