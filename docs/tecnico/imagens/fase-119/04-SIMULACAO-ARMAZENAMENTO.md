# 04 — Simulação de armazenamento (revisão dos cálculos da Fase 118)

## Nota sobre a divergência da Fase 118

A Fase 118 (`docs/comercial/planos/fase-118/01-AUDITORIA-ARMAZENAMENTO-R2.md`) misturou, sem declarar explicitamente, MB/GB no sentido decimal (1MB=1.000.000 bytes) com a divisão por 1024 (que é a convenção binária, MiB/GiB). Esta fase corrige isso adotando **uma única convenção, declarada explicitamente**:

- **1 MB = 1.000.000 bytes, 1 GB = 1.000 MB = 10⁹ bytes** (convenção decimal/SI), usada para TUDO abaixo (tamanho de foto e armazenamento agregado).
- A própria página oficial de preços da Cloudflare R2 (https://developers.cloudflare.com/r2/pricing/, consultada em 2026-10-12) **não define explicitamente** se o "GB" da cobrança é decimal ou binário — isto é **NÃO VERIFICADO** junto ao fornecedor. Se a Cloudflare cobrar usando GiB (1024³ bytes) em vez de GB decimal, o custo real seria **≈7% menor** que o calculado aqui (porque cada "unidade de cobrança" caberia mais bytes). Esta é uma margem de segurança pequena e não muda nenhuma conclusão qualitativa deste documento.

## Limites comerciais em estudo (ainda não aprovados — Fase 119, não os da Fase 117)

| Plano | Imóveis | Fotos/imóvel | Total máximo de fotos |
|---|---:|---:|---:|
| BASICO | 150 | 15 | 2.250 |
| PRO | 500 | 20 | 10.000 |
| PREMIUM | 1.500 | 40 | 60.000 |

## Armazenamento por organização, no limite máximo teórico (100% de uso do limite)

Fórmula: `armazenamento_GB = (total_de_fotos × tamanho_médio_MB) / 1000`

| Cenário de tamanho médio | BASICO (2.250 fotos) | PRO (10.000 fotos) | PREMIUM (60.000 fotos) |
|---|---:|---:|---:|
| 1 MB (sem otimização) | 2,25 GB | 10 GB | 60 GB |
| 2 MB (sem otimização, "esperado") | 4,5 GB | 20 GB | 120 GB |
| 5 MB (sem otimização, "alto consumo") | 11,25 GB | 50 GB | 300 GB |
| 500 KB = 0,5 MB (após otimização proposta) | 1,125 GB | 5 GB | 30 GB |
| 300 KB = 0,3 MB (após otimização agressiva) | 0,675 GB | 3 GB | 18 GB |

## Custo mensal estimado por organização (Cloudflare R2, US$0,015/GB-mês, antes da camada gratuita de 10GB)

| Cenário | BASICO | PRO | PREMIUM |
|---|---:|---:|---:|
| 1 MB | US$0,034 | US$0,15 | US$0,90 |
| 2 MB | US$0,068 | US$0,30 | US$1,80 |
| 5 MB | US$0,169 | US$0,75 | US$4,50 |
| 0,5 MB (otimizado) | US$0,017 | US$0,075 | US$0,45 |
| 0,3 MB (otimizado agressivo) | US$0,010 | US$0,045 | US$0,27 |

**Leitura**: mesmo no cenário "alto consumo" (5MB/foto) sem nenhuma otimização, uma única organização PREMIUM no limite máximo custaria US$4,50/mês em armazenamento — valor pequeno frente ao preço-alvo de R$349/mês (Fase 117/118). **O custo de armazenamento isolado nunca foi, em nenhum cenário simulado, um fator limitante de viabilidade do preço.**

## Armazenamento agregado para 10, 50 e 100 organizações

Cenário ilustrativo: todas as organizações no mesmo plano, no limite máximo, cenário "esperado" (2MB/foto sem otimização) vs. "otimizado" (0,5MB/foto). **Premissa explícita e irrealista por design** (serve para estabelecer um teto superior, não uma média esperada): a realidade é uma mistura de planos e taxas de uso parciais do limite.

| Plano | Org. | Sem otimização (2MB) | Com otimização (0,5MB) | Economia de armazenamento |
|---|---:|---:|---:|---:|
| BASICO | 10 | 45 GB → US$0,68/mês | 11,25 GB → US$0,17/mês | **75%** |
| BASICO | 50 | 225 GB → US$3,38/mês | 56,25 GB → US$0,84/mês | **75%** |
| BASICO | 100 | 450 GB → US$6,75/mês | 112,5 GB → US$1,69/mês | **75%** |
| PRO | 10 | 200 GB → US$3,00/mês | 50 GB → US$0,75/mês | **75%** |
| PRO | 50 | 1.000 GB → US$15,00/mês | 250 GB → US$3,75/mês | **75%** |
| PRO | 100 | 2.000 GB → US$30,00/mês | 500 GB → US$7,50/mês | **75%** |
| PREMIUM | 10 | 1.200 GB → US$18,00/mês | 300 GB → US$4,50/mês | **75%** |
| PREMIUM | 50 | 6.000 GB → US$90,00/mês | 1.500 GB → US$22,50/mês | **75%** |
| PREMIUM | 100 | 12.000 GB → US$180,00/mês | 3.000 GB → US$45,00/mês | **75%** |

A economia percentual é sempre **75%** nesse par de cenários (2MB→0,5MB é uma redução de 4×, matematicamente constante independente da escala) — o ganho em reais cresce com o volume, mas a **proporção de economia é a mesma em qualquer escala**.

## Economia estimada — a conclusão real não é "custo", é desempenho

Mesmo no cenário de 100 organizações PREMIUM simultâneas no limite máximo (12.000 GB = 12 TB), o custo mensal de armazenamento (~US$180, ≈R$900 pela cotação ilustrativa da Fase 118) é **irrelevante frente à receita correspondente** (100 × R$349 = R$34.900/mês). **A real justificativa para otimizar não é economizar em armazenamento R2** — é:

1. **Desempenho de carregamento** (Core Web Vitals, taxa de rejeição em conexão móvel) — uma galeria com fotos de 5MB cada demora sensivelmente mais para carregar do que uma com 500KB, mesmo com o otimizador do Next.js na entrega (que ainda precisa buscar o arquivo original do R2 antes de poder reduzi-lo).
2. **Egress da DigitalOcean** (não do R2, que é gratuito) — o tráfego do servidor Next.js para o navegador do visitante final é cobrado pela DO acima do incluso (`docs/comercial/planos/fase-118/02-CUSTOS-INFRAESTRUTURA.md`); arquivos menores reduzem esse custo, que **não foi medido nesta fase** (depende do tráfego real do site público, fora do escopo de uma auditoria de código).
3. **Previsibilidade operacional** — eliminar o pico de um upload de 10MB "no limite" protege contra picos de uso de memória/CPU no processo compartilhado da DO (mesmo risco já identificado para o gerador de anúncios na Fase 118).

## Impacto de requisições (operações R2)

Com os limites gratuitos (1M operações Classe A, 10M Classe B por mês), mesmo 100 organizações fazendo uploads (Classe A) e tendo suas fotos visitadas (Classe B) dificilmente aproximam-se dos milhões inclusos gratuitamente — **não investigado com dado real de tráfego, mas a ordem de grandeza (milhares a poucas centenas de milhares de operações/mês mesmo com 100 organizações ativas) está muito abaixo do teto gratuito**. Operações não são, portanto, um fator de custo relevante nesta simulação.

## Premissas e limitações

- Nenhum tamanho médio real de foto foi medido (sem acesso ao bucket de produção) — todos os cenários são ilustrativos.
- A simulação assume 100% de uso do limite do plano, um teto superior deliberadamente conservador/pessimista, não uma média esperada real.
- A cotação USD→BRL usada em documentos anteriores é ilustrativa, não oficial — valores em USD são a referência mais confiável aqui.
- Custo de egress da DigitalOcean não foi calculado (depende de tráfego real do site público, não investigado nesta fase).
