# Proposta de precificação (sugerida, não aprovada)

> **Todos os valores abaixo são SUGESTÕES para avaliação do proprietário do SaaS.** Nenhum preço foi aplicado em produção. A decisão final de preços pertence exclusivamente ao proprietário do produto.

## Contexto de mercado (ver `06-benchmark-concorrentes.md`)

A maioria dos concorrentes de porte médio/grande (Kenlo, Jetimob) não publica preço — vende por consulta. Quem publica preço de entrada (Imobzi, Loft/CRM) fica na faixa de **R$ 129–130/mês** para o plano mais básico. Isso estabelece um piso de referência de mercado para o segmento de entrada.

## Comparação de modelos de cobrança

| Modelo | Simplicidade comercial | Previsibilidade de receita | Facilidade de implementação | Risco operacional |
|---|---|---|---|---|
| Por imobiliária (fixo) | Alta — fácil de vender e explicar | Alta | Já suportado (plano atual do schema tem `priceMonthlyCents` por `Plan`) | Baixo, mas não escala receita com o tamanho do cliente |
| Por usuário | Média — exige explicar "o que conta como usuário" | Média-alta (cresce com o cliente) | `FEATURE_USERS`/limite por plano já existe no sistema (`entitlements.ts`) | Médio — cliente pode tentar contornar compartilhando login |
| Por faixa de usuários | Média | Alta | Reaproveita a mesma estrutura de limite por plano | Baixo |
| Plano único para o piloto | Muito alta (zero decisão a tomar agora) | Baixa (não é modelo final) | Imediata | Nenhum — é transitório por definição |

**Recomendação de modelo**: **por faixa de usuários**, por equilibrar simplicidade de venda com previsibilidade de receita, e por já ser tecnicamente suportado pela estrutura de planos existente (`Plan` + `PlanLimit` com `FEATURE_USERS`, usado em todo o ciclo de onboarding já implementado).

## Três propostas de plano

### Plano A — Piloto / Entrada

| Item | Valor sugerido |
|---|---|
| Valor mensal | **Gratuito por 60 dias**, depois R$ 149/mês |
| Público-alvo | Primeira imobiliária piloto, 1–3 usuários |
| Usuários incluídos | Até 3 |
| Limites sugeridos | Sem limite de imóveis nesta fase (ainda não há dado de uso real para dimensionar) |
| Funcionalidades disponíveis | Todas as listadas em `00-diagnostico-produto.md` |
| Custos/riscos | Custo de infraestrutura desprezível no plano Neon Free atual; risco é de tempo de suporte dedicado ao piloto, não de infraestrutura |
| Margem estimada | Não aplicável no período gratuito; a partir do mês 3, margem alta (custo de infraestrutura por cliente é muito baixo) |
| Expansão | Migra para Plano B ao crescer além de 3 usuários |

### Plano B — Essencial

| Item | Valor sugerido |
|---|---|
| Valor mensal | **R$ 249/mês** |
| Público-alvo | Imobiliária pequena/média, 4–10 usuários |
| Usuários incluídos | Até 10 |
| Limites sugeridos | Sem limite de imóveis (reavaliar após dados reais de uso) |
| Funcionalidades disponíveis | Todas |
| Custos/riscos | Custo de infraestrutura ainda baixo no plano Neon Free/Launch; risco de suporte cresce com o número de clientes neste plano |
| Margem estimada | Alta, estimativa preliminar sem dados reais de custo por cliente em produção |
| Expansão | Migra para Plano C com mais de 10 usuários |

### Plano C — Crescimento

| Item | Valor sugerido |
|---|---|
| Valor mensal | **R$ 449/mês** |
| Público-alvo | Imobiliária média/grande, 11–25 usuários |
| Usuários incluídos | Até 25 |
| Limites sugeridos | A definir — sugerido sem limite de imóveis até haver dado real de volume |
| Funcionalidades disponíveis | Todas |
| Custos/riscos | Neste volume, upgrade do plano Neon (de Free para Launch ou superior) passa a ser necessário — ver `10-preparacao-operacional.md`, C2 |
| Margem estimada | A recalcular quando o custo real de infraestrutura por cliente de porte maior for medido |
| Expansão | Acima de 25 usuários, negociar plano customizado |

## Recomendação fundamentada

1. **Para a primeira imobiliária piloto**: usar o **Plano A gratuito por 60 dias** — reduz a barreira de entrada ao extremo, prioriza coletar feedback real de uso sobre cobrar logo de início.
2. **Modelo de cobrança definitivo**: por faixa de usuários (A/B/C acima), por já ser tecnicamente suportado e ter boa relação simplicidade/previsibilidade.
3. **Não cobrar por imóvel cadastrado** nesta fase — não há dado real de quantos imóveis uma imobiliária típica cadastra, e um limite de imóveis mal calibrado pode frustrar o piloto logo no início.
4. **Reavaliar os três planos após o primeiro piloto** com dados reais de uso (número de imóveis, negociações, chamadas de suporte) antes de formalizar preços para o segundo cliente.

## O que esta fase explicitamente NÃO fez

- Não implementou cobrança recorrente.
- Não implementou bloqueio de plano por limite.
- Não alterou nenhum preço em produção (os planos hoje em `Plan`/`PlanLimit` no banco não foram tocados).
- Não integrou gateway de pagamento.
