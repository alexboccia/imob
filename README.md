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

## Configuração de marca (branding)

Centralizada em `src/lib/site-config.ts`, lida a partir de variáveis de ambiente — pensada para facilitar reaproveitar esta mesma base em um futuro cliente sem mexer no código:
- `NEXT_PUBLIC_NOME_IMOBILIARIA`
- `NEXT_PUBLIC_WHATSAPP_NUMERO` (formato internacional, ex: `5511999998888`)
- `NEXT_PUBLIC_EMAIL_CONTATO`

## Estrutura do projeto

```
src/app/(public)/     site público (home, /imoveis, /imoveis/[id], /vendidos, /anuncie, /contato)
src/app/app/          painel administrativo, em /app (protegido por login)
src/app/api/          rotas de API (auth, upload de mídia)
src/components/       componentes de UI compartilhados
src/components/admin/ componentes específicos do painel admin
src/lib/              Prisma client, Auth.js, R2, formatação, config de marca
prisma/schema.prisma  modelo de dados
prisma/seed.ts        seed do usuário administrador inicial
```

## Comandos úteis

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção
npm run lint         # lint
npx prisma studio    # explorar o banco de dados visualmente
npx prisma migrate dev --name <nome>   # criar uma nova migration
```

## O que já está implementado (v0)

- Site público: listagem de imóveis com filtros, página de detalhe (fotos/vídeos), página de vendidos/alugados, formulário de contato e "anuncie seu imóvel" (gravam leads no CRM).
- Painel admin: login, dashboard, CRUD de imóveis com upload de múltiplas fotos e vídeos (embed), controle de status (disponível/reservado/vendido/alugado/inativo) com histórico, CRM básico de clientes (funil, interações).

## Próximos passos (ver PRD.md, seções 11 e 13)

- Integração com os portais (ZAP, VivaReal, OLX, Imovelweb, Mercado Livre).
- Relatórios/dashboard mais completos por corretor/período.
- Identidade visual definitiva (ainda a criar).
- Deploy em produção (VPS + domínio já existente).
