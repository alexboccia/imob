# Recomendações futuras

Priorizadas por impacto na capacidade de vender/demonstrar o produto. **Nenhuma destas recomendações abre automaticamente uma nova fase** — todas dependem de decisão e priorização do proprietário.

## Alto impacto

### 1. Fotografias profissionais ou geradas por IA para o cenário de demonstração
**Por quê**: os placeholders atuais (SVG com ícone de casa) são limpos mas claramente não são fotos reais — numa demonstração mais longa ou mais detalhada, isso reduz o impacto visual. **Como**: a mesma técnica já usada em `public/hero-home.png` (imagem gerada por IA, já em uso na própria marca do produto) resolveria isso sem risco de direito autoral — mas requer uma ferramenta de geração de imagem, que esta sessão não tinha disponível. Alternativa de custo zero: fotos de bancos de imagem com licença CC0 (Unsplash, Pexels), desde que alguém confirme e registre a licença de cada uma antes de usar — não feito aqui por exigir verificação manual, caso a caso, de direito de uso.

### 2. Proposta de estrutura de landing page comercial (diagnóstico: não existe hoje)
A rota raiz do domínio de produção hoje mostra o site de UMA imobiliária específica (`PUBLIC_ORG_SLUG`), não uma página institucional do CRM. Proposta de estrutura, para avaliação futura (não implementada):

1. **Hero** — proposta de valor principal (reaproveitar o texto já validado em `docs/comercial/01-apresentacao-comercial.md`).
2. **Problema resolvido** — a dor de organização manual.
3. **Benefícios** — os 5 diferenciais já documentados.
4. **Funcionalidades** — resumo visual da jornada (Imóvel → Cliente → Negociação → Comissão).
5. **Demonstração** — convite a agendar (não um ambiente de self-service público).
6. **Planos** — **só depois de aprovação comercial explícita dos valores** (ver `docs/comercial/07-precificacao.md`, ainda sugeridos, não aprovados).
7. **Perguntas frequentes** — reaproveitar `docs/comercial/05-perguntas-frequentes.md`.
8. **Contato** — canal de suporte, quando C3 (`docs/operations/incident-response.md`) estiver resolvida.

**Não publicar nada disso automaticamente** — depende de decisão do proprietário sobre conteúdo final e sobre separar essa rota do site institucional de cada imobiliária (hoje a mesma estrutura `[orgSlug]` atende as duas coisas por acidente de configuração, não por design).

## Médio impacto

### 3. Staging remoto dedicado (Alternativa B não implementada)
Quando houver necessidade recorrente de demonstrações remotas sem depender da máquina do demonstrador. Custo e infraestrutura a avaliar quando a necessidade for real.

### 4. Importação em massa de imóveis/clientes
Mencionado como ausência no diagnóstico de produto da Fase 113 — relevante tanto para demonstrações mais ricas quanto para onboarding real de um cliente com base de dados existente.

## Baixo impacto

### 5. Comando de reset do cenário de demonstração
O seed atual é idempotente mas não tem um comando de "recomeçar do zero" — hoje isso exige uma ação manual (Prisma Studio ou script avulso). Baixa prioridade porque o cenário atual já serve para múltiplas demonstrações sem necessidade de reset.

### 6. Variação de dados do cenário (segunda organização demo com outro perfil)
Útil para demonstrar o produto a um público diferente (ex: imobiliária focada só em locação) — não necessário para a primeira rodada de demonstrações.
