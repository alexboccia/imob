# 07 — Impacto nos planos comerciais

Avaliação dos limites em estudo (BASICO 150/15, PRO 500/20, PREMIUM 1.500/40 — imóveis/fotos por imóvel) à luz da auditoria técnica.

## 1. Esses limites são tecnicamente seguros?

**Sim, sob a ótica de custo de armazenamento** — confirmado em `04-SIMULACAO-ARMAZENAMENTO.md`: mesmo no cenário mais pessimista (5MB/foto, sem otimização, 100 organizações PREMIUM simultâneas no limite máximo), o custo de armazenamento R2 fica em torno de centenas de dólares/mês, irrelevante frente à receita correspondente. **Não são seguros sob a ótica de qualidade/privacidade das fotos armazenadas** enquanto a compressão/remoção de EXIF não for implementada (`06-SEGURANCA-IMAGENS.md`, item 1) — isso não é um risco que aumenta com o limite numérico, mas aumenta em **volume absoluto de exposição** (mais fotos com GPS preservado, se os limites subirem).

## 2. Qual seria o custo aproximado por organização?

Ver tabela completa em `04-SIMULACAO-ARMAZENAMENTO.md`. Resumo: entre US$0,01 e US$4,50/mês por organização, dependendo do plano e do cenário de tamanho médio de foto — em todos os casos, uma fração pequena do preço-alvo de cada plano (R$99/199/349).

## 3. O limite deve considerar imagens originais ou versões otimizadas?

**Recomenda-se que o limite de PLANO continue contando "quantidade de fotos"** (como já funciona, `PHOTOS_PER_PROPERTY`), não tamanho em bytes — é o que o cliente entende e compara com concorrentes (Fase 117). Se a compressão no servidor for implementada (`03-ESTRATEGIAS-OTIMIZACAO.md`), o TAMANHO real armazenado por foto cai (resultado da otimização), mas a CONTAGEM de fotos permitida por imóvel não precisa mudar — são dimensões independentes.

## 4. Devemos limitar o tamanho máximo de cada fotografia?

**Já existe um limite** (10MB, `LIMITE_TAMANHO_BYTES.imagem`). Recomenda-se mantê-lo como teto de ENTRADA (o que o navegador pode enviar), mas **a saída armazenada, uma vez implementada a compressão no servidor, ficaria sempre abaixo de um teto bem menor** (ex.: algumas centenas de KB, dependendo do parâmetro de qualidade escolhido) — não exigindo reduzir o limite de entrada de 10MB, que já funciona como proteção contra abuso grosseiro.

## 5. É necessário limitar o armazenamento total por organização (em GB, não em contagem de fotos)?

**Não é necessário hoje**, dado que o custo de armazenamento é irrelevante nas escalas simuladas. Um limite de armazenamento total em GB adicionaria complexidade (um novo tipo de `PlanLimit`, uma nova métrica a calcular e exibir) sem benefício financeiro claro — a contagem de fotos já funciona como um proxy razoável e mais simples de comunicar comercialmente.

## 6. Como tratar fotografias já existentes (antes de qualquer otimização ser implementada)?

Se a compressão no servidor for aprovada e implementada, ela se aplicaria **apenas a novos uploads** a partir da data de ativação — fotos já armazenadas sem compressão continuariam como estão, a menos que se decida (em uma fase de implementação futura, não aqui) rodar um processo de reprocessamento retroativo em lote. **Não recomendado fazer isso automaticamente**: reprocessar fotos já publicadas é uma operação que altera arquivo em produção e merece sua própria avaliação de risco/aprovação, separada da decisão de comprimir uploads novos.

## 7. Como monitorar o consumo por imobiliária?

**Não existe hoje nenhum painel/métrica de "quanto armazenamento R2 esta organização está usando"** — nem para o Super Admin nem para a própria organização. Isso é uma lacuna de observabilidade, não de enforcement (o enforcement de CONTAGEM de fotos já existe e funciona, `verificarLimiteFotos`). Recomenda-se, como melhoria futura (não implementada aqui), um relatório periódico (ou sob demanda) agregando `COUNT`/estimativa de tamanho por organização — útil tanto para o Super Admin decidir sobre custos agregados quanto para eventualmente avisar uma organização que está se aproximando de um teto, se um vier a ser criado.

## Conclusão

Os limites propostos (150/500/1.500 imóveis, 15/20/40 fotos) **não encontram impedimento técnico de custo** nesta auditoria. O que precisa de decisão do proprietário não é o número dos limites em si, e sim **se e quando implementar a compressão no servidor** — que resolve simultaneamente privacidade (EXIF/GPS), desempenho de carregamento e previsibilidade operacional, com um custo de armazenamento que, com ou sem compressão, nunca foi o fator limitante real.
