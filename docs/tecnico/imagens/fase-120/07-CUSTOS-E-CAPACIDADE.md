# 07 — Impacto de custo e capacidade

**Convenção de unidades** (mesma da Fase 119, reafirmada): 1 MB = 1.000.000 bytes, 1 GB = 1.000 MB (decimal/SI). A Cloudflare não define explicitamente se sua cobrança em "GB" é decimal ou binária (NÃO VERIFICADO junto ao fornecedor) — se for binária (GiB), o custo real seria ≈7% menor que o calculado aqui. Preço R2 usado: US$0,015/GB-mês (oficial, https://developers.cloudflare.com/r2/pricing/, consultado em 2026-10-12, Fase 118).

**Classificação de cada número abaixo**: TODOS os valores de armazenamento/custo deste documento são **estimativas de simulação**, não medições reais — nenhum acesso ao bucket de produção foi feito nesta fase (proibido pelo briefing). Tamanhos médios de foto (1/2/5MB originais, 0,3/0,5MB otimizados) são premissas ilustrativas, não amostras medidas.

## Matriz comercial consolidada em uso nesta simulação

| Plano | Imóveis | Fotos/imóvel | Capacidade teórica (100%) |
|---|---:|---:|---:|
| BASICO | 150 | 15 | 2.250 fotos |
| PRO | 500 | 20 | 10.000 fotos |
| PREMIUM | 1.500 | 40 | 60.000 fotos |

## 1. Armazenamento por organização, por taxa de utilização do limite (cenário "esperado", 2MB/foto sem otimização)

| Plano | 25% do limite | 50% do limite | 75% do limite | 100% do limite |
|---|---:|---:|---:|---:|
| BASICO | 563 fotos → 1,13 GB → US$0,017 | 1.125 fotos → 2,25 GB → US$0,034 | 1.688 fotos → 3,38 GB → US$0,051 | 2.250 fotos → 4,5 GB → US$0,068 |
| PRO | 2.500 fotos → 5 GB → US$0,075 | 5.000 fotos → 10 GB → US$0,15 | 7.500 fotos → 15 GB → US$0,225 | 10.000 fotos → 20 GB → US$0,30 |
| PREMIUM | 15.000 fotos → 30 GB → US$0,45 | 30.000 fotos → 60 GB → US$0,90 | 45.000 fotos → 90 GB → US$1,35 | 60.000 fotos → 120 GB → US$1,80 |

**Leitura**: mesmo no pior caso (100% de utilização, PREMIUM), o custo de armazenamento por organização fica abaixo de US$2/mês — irrelevante frente ao preço-alvo de R$349/mês.

## 2. Armazenamento agregado — 10, 50 e 100 organizações (cenário "esperado", 50% de utilização média, 2MB/foto)

**Premissa explícita**: 50% de utilização é uma suposição de planejamento, não uma média medida — escolhida como ponto intermediário mais plausível que o teto de 100% (que serve de limite superior, não de expectativa realista).

| Plano | 10 organizações | 50 organizações | 100 organizações |
|---|---:|---:|---:|
| BASICO | 22,5 GB → US$0,34 | 112,5 GB → US$1,69 | 225 GB → US$3,38 |
| PRO | 100 GB → US$1,50 | 500 GB → US$7,50 | 1.000 GB → US$15,00 |
| PREMIUM | 600 GB → US$9,00 | 3.000 GB → US$45,00 | 6.000 GB → US$90,00 |

**Teto superior (100% de utilização, todas no limite máximo simultaneamente)**, para referência de pior caso absoluto: ver `04-SIMULACAO-ARMAZENAMENTO.md` da Fase 119, que já calculou esse cenário (até US$180/mês para 100 organizações PREMIUM a 2MB/foto, US$450/mês no cenário "alto consumo" de 5MB/foto).

## 3. Economia percentual estimada com a compressão proposta (Perfil B, `02-ARQUITETURA-COMPRESSAO.md`)

| Comparação | Redução de tamanho | Redução de armazenamento (idêntica à redução de tamanho, relação linear) |
|---|---:|---:|
| 2MB (original, "esperado") → 0,5MB (otimizado) | 4× | **75%** |
| 2MB (original) → 0,3MB (otimizado agressivo) | 6,7× | **85%** |
| 5MB (original, "alto consumo") → 0,5MB (otimizado) | 10× | **90%** |
| 1MB (original, "conservador") → 0,5MB (otimizado) | 2× | **50%** |

A economia percentual é constante em qualquer escala (depende só da razão entre tamanho original e otimizado, não do número de organizações) — o ganho em valor absoluto (US$/mês) cresce com o volume, mas a conclusão qualitativa da Fase 119 permanece: **o valor real da otimização não é a economia de armazenamento em si** (sempre uma fração pequena de dólares/mês mesmo em 100 organizações), **é desempenho de carregamento e a correção simultânea do risco de privacidade EXIF/GPS**.

## 4. Armazenamento de versões derivadas (thumbnails) — decisão de não recomendar

**Não é recomendado armazenar versões derivadas (thumbnails) persistentes no R2.** Justificativa: o `next/image` já gera variantes redimensionadas sob demanda no momento da entrega (confirmado em `01-ESTADO-ATUAL-VALIDADO.md` item 9), sem custo de armazenamento adicional — introduzir thumbnails armazenados duplicaria o número de objetos no R2 (mais operações Classe A de escrita, mais armazenamento) para resolver um problema que a arquitetura atual já resolve de outra forma, sem esse custo. Esta decisão **mantém zero overhead de armazenamento adicional** nos cálculos acima.

## 5. Impacto de requisições R2 (operações)

Com a camada gratuita de 1M operações Classe A e 10M Classe B por mês (Cloudflare R2), mesmo 100 organizações fazendo uploads e tendo fotos visitadas permanecem, por ordem de grandeza, muito abaixo desses tetos — **não medido com dado real de tráfego (NÃO VERIFICADO)**, mas consistente com a mesma conclusão da Fase 119: operações não são um fator de custo relevante nesta simulação, em nenhum dos cenários de utilização.

## 6. Impacto de CPU e memória no servidor (DigitalOcean)

A compressão proposta adiciona decode+encode via `sharp` à mesma requisição síncrona que já lê o arquivo inteiro em memória hoje (sem compressão). **Não é um padrão de risco novo** — é o mesmo padrão já aceito para o Hero, a geração de anúncios de marketing e a extração de paleta de logo, todos já em produção. O risco já identificado (Fase 118): ausência de fila/worker dedicado significa que picos de upload simultâneo competem pelo mesmo processo compartilhado entre todas as organizações. **Subir os limites comerciais (mais imóveis/fotos por organização) aumenta a FREQUÊNCIA potencial de uploads simultâneos, não a complexidade de cada upload individual** — mitigação proposta (rate limit já existente, mesmo que fail-open) já limita a taxa máxima por organização/usuário.

## 7. Impacto de tráfego (egress)

Egress do R2 é gratuito (confirmado, Fase 118/119). O tráfego relevante de custo é o egress da própria DigitalOcean (servidor → visitante do site público), não medido nesta fase — reduzir o tamanho médio de foto (compressão) reduz esse tráfego proporcionalmente, mas o valor em R$/mês só pode ser estimado com dado real de visitas, fora do escopo autorizado aqui.

## 8. Riscos de crescimento

- **Teto compartilhado da Neon (20GB, plano Free)**: não afetado pelo armazenamento de FOTOS (que fica no R2, não no Postgres) — mas afetado pelo crescimento do NÚMERO de registros `Media`/`Property`/`Person` se os limites comerciais subirem, mesma ressalva já registrada na Fase 118.
- **Crescimento de órfãos** (`05-CICLO-VIDA-R2.md`): cresce com o volume de edições de foto e com o número de organizações excluídas ao longo do tempo — não é proporcional aos limites comerciais em si, é proporcional ao USO (quantas vezes uma foto é substituída) e ao CHURN (quantas organizações saem da plataforma).
- **Concentração de custo em poucas organizações no limite máximo**: o cenário de 100% de utilização simultânea é um teto teórico improvável na prática (a maioria das organizações provavelmente não usa 100% do limite todo o tempo) — mas não há dado real para confirmar essa suposição.

## 9. Métricas a coletar na futura fase de medição real

1. Tamanho médio e distribuição (percentis) real de foto enviada, por organização e agregado.
2. Contagem real de objetos R2 por organização e por pasta (comparado ao que o banco referencia, para estimar o volume real de órfãos hoje acumulados).
3. Volume real de operações Classe A/B mensal (confirmar se está de fato dentro da camada gratuita).
4. Tempo real de processamento de upload (para calibrar se um futuro timeout de compressão é necessário).
5. Taxa real de utilização do limite de fotos/imóveis por organização (para validar ou corrigir a premissa de 50% usada nesta simulação).
6. Volume real de tráfego de egress da DigitalOcean atribuível a imagens (para estimar o ganho real de custo da compressão, hoje apenas qualitativo).

**Nenhuma destas métricas foi coletada nesta fase** — ficam registradas como pré-requisito de uma fase de medição real futura, que não bloqueia o planejamento técnico aqui apresentado.
