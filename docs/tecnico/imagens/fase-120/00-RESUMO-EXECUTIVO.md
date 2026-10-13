# 00 — Resumo executivo — Fase 120

**Veredito: AGUARDANDO APROVAÇÃO TÉCNICA PARA IMPLEMENTAÇÃO.** Fase exclusivamente documental e de planejamento — nenhum código, schema, dado, configuração do R2, plano comercial ou produção foi alterado; nenhuma operação de escrita/exclusão no R2 foi executada; nenhum commit/push/deploy foi realizado.

## Diagnóstico consolidado

Todos os 10 achados da Fase 119 foram **revalidados por releitura direta do código nesta fase** (`01-ESTADO-ATUAL-VALIDADO.md`) — **zero divergência encontrada**, porque o código-fonte não mudou entre as duas fases (mesmo commit, mesmo working tree de `src/`/`prisma/`). Confirmado novamente: fotos de imóvel não passam por compressão; EXIF/GPS é preservado; exclusão nunca remove objetos do R2; exclusão de organização é a origem mais grave de arquivos órfãos (hoje irrecuperável); mídia de imóvel é a única categoria sem validação de origem de URL.

## Arquitetura recomendada

Estender o padrão já em produção do Hero (sharp → `.rotate()` → `.resize()` → `.webp()`) para a pasta `imoveis`, no servidor, na mesma requisição de upload — nenhuma dependência nova, reaproveitamento total de código já testado. A remoção de EXIF/GPS é resolvida como efeito colateral da mesma mudança, sem lógica adicional dedicada.

## Parâmetros propostos

Três perfis comparados (`02-ARQUITETURA-COMPRESSAO.md`): Econômico (qualidade 70, maior risco visual), **Equilibrado — recomendado** (largura máxima 2048px, qualidade WebP 82 — mesmo valor já validado em produção pelo Hero), Alta qualidade (qualidade 90, menor economia). Nenhum valor foi fixado — todos pendentes de validação visual com amostra real antes de produção.

## Segurança

Plano de correção da lacuna de validação de origem de URL para mídia de imóvel (alinhando ao padrão já aplicado em materiais/hero/perfil/logo), cabeçalhos de cache/disposição explícitos (incluindo `attachment` para PDFs de materiais, mitigando risco de script embutido), e manutenção deliberada do comportamento fail-open do rate limit de upload (justificada pela existência independente do limite de plano, que nunca é fail-open). EXIF/GPS resolvido junto com a compressão; fotos legadas NÃO recomendadas para reprocessamento em massa — só sob demanda, por organização.

## Ciclo de vida R2

Proposto um módulo reutilizável de remoção de objetos (hoje inexistente — a única lógica de delete está duplicada inline em `manutencao/actions.ts`), aplicado com a ordem correta (banco confirmado primeiro, R2 depois) para nunca gerar referência quebrada. Para exclusão de organização, proposto um padrão outbox (nova tabela `PlatformStorageCleanupTask`) que captura os prefixos R2 ANTES da exclusão do banco — resolve o achado mais grave da Fase 119. Para órfãos já existentes, proposto um mecanismo de inventário com dry-run obrigatório, classificação de confiança (alta/média) e quarentena antes de qualquer remoção real — nenhuma exclusão foi executada.

## Impacto comercial

Os limites consolidados (BASICO 150/15, PRO 500/20, PREMIUM 1.500/40) **não encontram impedimento técnico de custo** nesta auditoria (`07-CUSTOS-E-CAPACIDADE.md`) — mesmo em cenários de 100 organizações no limite máximo, o custo de armazenamento R2 fica na ordem de centenas de dólares/mês, irrelevante frente à receita correspondente. A economia estimada da compressão (~75-90%) é real, mas sua justificativa principal não é financeira — é desempenho de carregamento e a correção de privacidade.

## Roadmap

Cinco etapas (`08-ROADMAP-TECNICO.md`): A (segurança do upload) e B (compressão) em paralelo; C (exclusão individual) depende de B; D (exclusão de organização + órfãos, a mais crítica) depende de C; E (fotos legadas, testes, observabilidade) depende de B+C+D maduras em produção. Cada etapa documentada com objetivo, arquivos afetados, riscos, testes, critérios de aceite, rollback e aprovações necessárias.

## Decisões pendentes

10 decisões objetivas listadas em `10-DECISOES-PARA-APROVACAO.md`, cobrindo: aprovação da compressão e seu perfil, correção de validação de URL, estratégia para fotos legadas, construção do módulo de remoção R2, criação da tabela de tarefas de limpeza, período de retenção, modo de processamento (manual vs. cron), e confirmação dos limites comerciais.

## Integridade do repositório

- Nenhum código alterado: confirmado (`git status --short` mostra só os documentos novos e o drift pré-existente).
- Nenhum schema alterado: confirmado (nenhuma migration criada, nenhuma alteração em `prisma/schema.prisma`).
- Nenhum banco modificado: confirmado (nenhum comando de escrita executado).
- Nenhuma operação de escrita no R2: confirmado (nenhum upload/exclusão real executado).
- Nenhuma configuração de produção alterada: confirmado.
- Nenhum commit, push ou deploy: confirmado.
- Drift pré-existente preservado: confirmado (`src/app/layout.tsx` modificado e `public/demo-fotos/` não rastreado permanecem exatamente como estavam).
- Somente a documentação da Fase 120 foi adicionada: confirmado — ver lista de arquivos abaixo.

## Documentos criados

Todos em `docs/tecnico/imagens/fase-120/`, nenhum documento de fase anterior foi modificado: `00-RESUMO-EXECUTIVO.md` (este), `01-ESTADO-ATUAL-VALIDADO.md`, `02-ARQUITETURA-COMPRESSAO.md`, `03-PRIVACIDADE-EXIF-GPS.md`, `04-SEGURANCA-MULTITENANT.md`, `05-CICLO-VIDA-R2.md`, `06-CONSISTENCIA-BANCO-STORAGE.md`, `07-CUSTOS-E-CAPACIDADE.md`, `08-ROADMAP-TECNICO.md`, `09-PLANO-DE-TESTES.md`, `10-DECISOES-PARA-APROVACAO.md`, `11-CHECKLIST-PRE-IMPLEMENTACAO.md`.

**Aguardando aprovação técnica do proprietário antes de qualquer implementação. Não avançar automaticamente para a Fase 121.**
