# Guia de preparação do ambiente de demonstração

## Pré-requisitos

1. Projeto clonado e dependências instaladas (`npm install`).
2. Postgres local rodando (mesmo ambiente usado em todo o desenvolvimento — ver README, seção de setup local).
3. `npx prisma db seed` (ou `npx tsx prisma/seed.ts`) **já executado** nesse banco — o seed de demonstração reaproveita o plano PREMIUM criado por ele e não duplica esse bootstrap.

## Passo a passo

```bash
# 1. Confirmar que o banco de destino é local (o script recusa qualquer
#    outra coisa por padrão).
echo $DATABASE_URL   # deve conter localhost ou 127.0.0.1

# 2. Rodar o seed de demonstração — os dois portões de segurança abaixo
#    são obrigatórios e deliberados (ver 06-checklist-funcional.md para
#    a prova de que o script recusa sem eles).
DEMO_SEED_CONFIRM="seed-demo-local-only" npx tsx prisma/seed-demo.ts
```

Saída esperada (idempotente — rodar de novo não duplica):

```
Organização demo pronta: imobiliaria-horizonte-demo (id: ...)
Senha de todos os usuários demo: DemoHorizonte2026!
12 imóveis criados.
15 clientes criados.
8 negociações criadas (...)
7 atividades criadas.
Seed de demonstração concluído com sucesso.
```

## Login

```
npm run dev
```

Acessar `http://localhost:3000/app/login` com qualquer um dos 4 usuários listados em `02-inventario-cenario.md` e a senha `DemoHorizonte2026!`.

**Recomendação de uso na demonstração**: logar como `admin@imobiliariahorizonte.demo` (visão de proprietário — vê tudo) para a maior parte do roteiro; trocar para `corretor3@imobiliariahorizonte.demo` especificamente para mostrar "Minhas comissões" com dado real de comissão a receber (ver `04-roteiro-demonstracao.md`).

## Resetar o cenário (se necessário)

O script não tem comando de "reset" embutido de propósito — nunca implementar `deleteMany` solto num script que roda contra um banco real (mesmo local), conforme a própria fase exige. Para recomeçar do zero, remover a organização manualmente via Prisma Studio (`npx prisma studio`) ou um script avulso e específico, nunca genérico.

## Segurança do script — o que ele garante

- **Nunca** roda sem a variável `DEMO_SEED_CONFIRM` com o valor exato esperado.
- **Nunca** roda contra uma `DATABASE_URL` que não pareça local, a menos que um segundo flag explícito (`DEMO_SEED_ALLOW_REMOTE`) seja passado — e mesmo assim, nunca contra produção (não há flag que libere isso automaticamente; exigiria editar o código deliberadamente).
- **Nunca** usa `deleteMany` — é estritamente aditivo.
- Identificado por um slug fixo (`imobiliaria-horizonte-demo`) — sempre a mesma organização, nunca duplicada.
