# Landing page institucional do SaaS (WEB-001)

## Diagnóstico (confirmado nesta fase, mesma conclusão da Fase 115)

Antes desta fase, não existia nenhuma página que apresentasse o **produto** (Sistema Imobiliário) em si. A rota raiz do domínio de produção serve o site público de UMA organização específica (`PUBLIC_ORG_SLUG`, via `src/proxy.ts`), e todo o resto de `src/app/[orgSlug]/` é site de imobiliária cliente, não do SaaS. Não existe ToS, nem landing institucional, em nenhum nível — confirmado por busca exaustiva no código (grep por "landing", "institucional", "termos-de-uso" fora de `[orgSlug]`, sem resultado relevante).

## O que foi implementado nesta fase

Uma página institucional inicial, em `src/app/sistema-imobiliario/page.tsx`, **deliberadamente não divulgada**:

- `robots: { index: false, follow: false }` — nunca indexada por buscadores.
- Não é referenciada em `src/app/sitemap.ts` (que só lista páginas de organizações) nem precisa de ajuste em `src/app/robots.ts`.
- Não existe link para esta rota em nenhuma outra página do produto — só é alcançável por quem já tem a URL exata.
- Vive FORA de `[orgSlug]` e fora da lista de rewrites (`src/lib/rotas-publicas.ts`), então nenhum host de organização jamais responde nela.

### Conteúdo

Estrutura seguida (adaptada da sugerida na Parte F, sem os itens não aprovados):

1. **Hero** — proposta de valor principal, reaproveitada literalmente de `docs/comercial/01-apresentacao-comercial.md` (Fase 113).
2. **Problema** — a dor de planilha/WhatsApp/caderno, mesmo texto já validado comercialmente.
3. **Jornada** — Imóvel → Cliente → Negociação → Agenda → Comissão.
4. **Diferenciais** — os 5 diferenciais já documentados e demonstráveis.
5. **Planos** — **nenhum valor exibido**. Chamada neutra: *"Conheça nossos planos — solicite uma demonstração"*, conforme instrução explícita da Parte H. Os valores sugeridos na Fase 113 (R$ 149/249/449) não aparecem em lugar nenhum do código — confirmado por busca, zero ocorrências fora de `docs/comercial/`.
6. **FAQ** — 4 perguntas reaproveitadas de `docs/comercial/05-perguntas-frequentes.md`, sem invenção de conteúdo novo.
7. **Contato** — reaproveita o telefone de suporte configurado pela Plataforma (`PlatformSettings`, Fase 112) via `buscarConfiguracaoSuporte()`/`linkWhatsAppSuporte()`. Nenhum número fixo no código; se o Super Admin ainda não configurou um telefone, a seção mostra uma mensagem neutra em vez de um link quebrado ou um número inventado.

### Por que isso não é uma publicação

A página existe no repositório e é servida pela aplicação (confirmado via `npm run build` e teste local), mas:
- Não há nenhum link apontando para ela.
- `robots: noindex, nofollow` impede indexação mesmo que alguém a descubra por acaso.
- Nenhum canal comercial (WhatsApp, e-mail, redes sociais) foi instruído a divulgá-la.

Isto está alinhado à instrução explícita da Parte F: "implementar uma versão inicial isolada e não divulgada, desde que não gere alterações não autorizadas em produção." Nenhuma rota pública existente foi alterada; nenhum conteúdo foi publicado para o público.

## Limitações conhecidas

- Não há teste de performance/Lighthouse formal nesta fase — a página usa os mesmos componentes de UI (Button/Card) e mesma stack (Tailwind, Server Component) já performática em todo o produto.
- Não há revisão de copywriting profissional — o texto é o já aprovado comercialmente em fases anteriores, sem novo texto de marketing inventado.
- Decisão de publicar (torná-la indexável, linkada, com domínio próprio) depende do proprietário — **não é tomada aqui**.
