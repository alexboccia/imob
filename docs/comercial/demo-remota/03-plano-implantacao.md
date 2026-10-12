# Plano de implantação — Alternativa B (staging isolado)

**Nada neste documento foi executado.** É a arquitetura e o procedimento para quando (e se) o proprietário aprovar a Alternativa B. Nenhum recurso externo foi criado nesta fase.

## 1. Arquitetura proposta

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│   DigitalOcean App Platform  │        │   Neon — projeto/branch       │
│   (novo serviço, isolado)    │◄──────►│   SEPARADO de produção        │
│                               │        │   (nunca a mesma DATABASE_URL)│
│  mesmo código (branch/tag),  │        └──────────────────────────────┘
│  variáveis de ambiente       │
│  PRÓPRIAS (nenhuma           │        ┌──────────────────────────────┐
│  compartilhada com produção) │◄──────►│   Upstash Redis (rate limit)  │
└──────────────┬───────────────┘        │   instância própria ou        │
               │                         │   compartilhada (ver nota)    │
               ▼                         └──────────────────────────────┘
   contas demonstrativas
   (permissão mínima,
   criadas pelo seed-demo.ts
   adaptado — ver §2)
```

Componentes:
- **App**: mesmo código-fonte de produção (mesma branch `main`, ou uma tag/release específica), implantado como um serviço separado na DigitalOcean (ou plataforma equivalente).
- **Banco**: projeto/branch Neon **separado** — nunca a `DATABASE_URL` de produção. Decisão sobre plano (Free vs. pago) depende de quantos projetos o plano atual permite — **a confirmar antes de criar** (ver `01-auditoria-infraestrutura.md`, "NÃO VERIFICADO — plano Neon").
- **Rate limiting**: recomenda-se uma instância Upstash própria (barata/gratuita no tier free da Upstash) para não compartilhar contadores com produção; alternativa aceitável é compartilhar a mesma instância com um prefixo de chave diferente, já que o rate limiting é só defensivo, não armazena dado sensível.
- **E-mail (Resend)**: **deliberadamente NÃO configurado** neste ambiente (ver `04-checklist-seguranca.md`) — sem `RESEND_API_KEY`, os fluxos de e-mail retornam `enviado: false` com log de aviso, por design já existente em `src/lib/email.ts`. Nenhum código novo é necessário para isso.
- **Monitoramento**: Sentry com DSN e `environment` próprios (`NEXT_PUBLIC_SENTRY_ENVIRONMENT=demo` ou equivalente), para nunca misturar eventos de demo com os de produção.

## 2. Pré-requisitos

- Decisão do proprietário para criar recursos pagos/novos (este documento não autoria nada por si).
- Confirmação do plano Neon efetivo e de que criar um projeto/branch adicional não força upgrade indesejado.
- `prisma/seed-demo.ts` (Fase 115) já é compatível com um banco remoto isolado **desde que**: (a) `DEMO_SEED_CONFIRM=seed-demo-local-only` continue sendo exigido — ou seja, será necessário decidir se o nome da variável/valor devem mudar para refletir "ambiente remoto autorizado" em vez de "local only" (hoje o script nomeia a variável como "local only" de propósito, para não ser reaproveitado displicentemente num banco remoto); (b) `DEMO_SEED_ALLOW_REMOTE=yes-i-am-sure` seja definida explicitamente, já que a `DATABASE_URL` de um staging não bate no regex `localhost|127.0.0.1`.
  - **Recomendação**: antes de rodar o seed contra o staging, renomear/ajustar essa guarda para deixar claro que "remoto autorizado" é diferente de "produção" — proposta de nome: manter os dois env vars como estão (já são explícitos e exigem valor exato), e documentar no runbook de ativação que `DEMO_SEED_ALLOW_REMOTE` só deve ser setada no ambiente de staging, nunca em produção.

## 3. Procedimento de implantação (quando aprovado)

1. Provisionar o novo serviço (DO App Platform) a partir do mesmo repositório, branch dedicada ou a mesma `main` com uma configuração de ambiente própria.
2. Provisionar o banco Neon separado; rodar `npx prisma migrate deploy` contra ele (mesmo mecanismo do `scripts/migrate-deploy.ts` já usado em produção).
3. Configurar variáveis de ambiente do novo serviço: `DATABASE_URL` (do banco novo), `AUTH_SECRET`/`PLATFORM_AUTH_SECRET` (gerados novos, nunca copiados de produção), `NEXT_PUBLIC_SITE_URL` (domínio do staging), `UPSTASH_REDIS_REST_*` (ativar rate limiting), `NEXT_PUBLIC_SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_ENVIRONMENT=demo`. **Deliberadamente omitir** `RESEND_API_KEY`/`RESEND_FROM_EMAIL`.
4. Rodar `DEMO_SEED_CONFIRM=seed-demo-local-only DEMO_SEED_ALLOW_REMOTE=yes-i-am-sure npx prisma db seed` (ou o comando equivalente) contra o banco do staging — cria a organização "Imobiliária Horizonte — Demonstração" e os usuários demo.
5. Validar acesso (ver §6).
6. Comunicar a URL apenas às pessoas autorizadas (nunca publicar em canal público, nunca indexar — ver `06-landing-page.md` sobre a landing já implementada localmente nesta fase, que também não é indexada).

## 4. Checklist de segurança

Ver documento dedicado `04-checklist-seguranca.md`.

## 5. Estimativa de custos

Ver `08-plano-ativacao.md`.

## 6. Procedimento de validação

- Login com as contas demo criadas pelo seed, confirmar redirecionamento para a organização correta.
- Tentar acessar `/platform` com uma conta demo comum → deve falhar (nenhuma conta demo tem papel de operador de plataforma).
- Testar o fluxo de "esqueci minha senha" e confirmar que NENHUM e-mail é efetivamente enviado (log de aviso "Resend não configurado" em vez de sucesso) — prova de que o bloqueio de e-mail real está em vigor.
- Confirmar que o rate limiting está ativo (não fail-open) testando um bloqueio de login deliberado.
- Confirmar nos logs do Sentry do ambiente demo (`environment=demo`) que eventos não se misturam com produção.

## 7. Procedimento de desativação

- Derrubar o serviço da DigitalOcean (ou escalar para zero, se a plataforma permitir).
- Manter ou destruir o banco Neon conforme decisão do proprietário — como não há dado real, destruir é seguro e recomendado se o staging ficar ocioso por muito tempo (evita custo recorrente desnecessário).
- Revogar/rotacionar os secrets gerados especificamente para esse ambiente.
