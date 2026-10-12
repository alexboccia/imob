# Checklist visual — resultado da auditoria de UX/UI

**Método**: inspeção visual real via Playwright contra o ambiente local com o cenário de demonstração carregado (capturas de tela reais, não apenas leitura de código — mesma técnica já estabelecida em fases anteriores de homologação visual). 10 telas capturadas: login, dashboard, imóveis (lista e ficha), clientes, pipeline, agenda, comissões (admin e corretor), marketing/divulgação, mobile (390px).

## Resultado por tela

| Tela | Clareza | Consistência | Estados vazios | Dados do cenário | Resultado |
|---|---|---|---|---|---|
| Login | OK | OK | N/A | N/A | Aprovado |
| Dashboard | OK — KPIs, gráficos e "Primeiros passos" claros | OK | N/A (cenário tem dado) | Coerentes (9 disponíveis, 15 leads, 1 fechado) | Aprovado |
| Imóveis (lista) | OK — filtros, busca, contadores | OK | N/A | 12 imóveis, preços e status corretos, nunca "R$ 0" | Aprovado |
| Clientes (lista) | OK | OK | N/A | Corrigido nesta fase (ver achado abaixo) | Aprovado após correção |
| Pipeline | OK — board por estágio, prioridade, taxa de ganho | OK | N/A | 6 em andamento + 1 ganho + 1 perdido, nomes/responsáveis corretos | Aprovado |
| Agenda | OK — contadores Hoje/Próximas/Anteriores | OK | N/A | 4 próximas + 3 anteriores | Aprovado |
| Minhas comissões (corretor) | OK — resumo + detalhe por negócio | OK | N/A | R$23.000 participação, R$12.000 recebido, R$11.000 a receber | Aprovado |
| Marketing (Criar divulgação) | OK — prévia dos dados antes de gerar | OK | N/A | Preço/localização/características corretos no resumo | Aprovado |
| Mobile (390px) | OK — sem necessidade de nova verificação de responsividade geral (já homologada na Fase 105) | OK | — | — | Aprovado |

## Achado real, corrigido nesta fase (dado do seed, não bug de produto)

**Não é um defeito de UX/UI do CRM.** É uma imperfeição do CONJUNTO DE DADOS gerado pelo seed de demonstração, encontrada durante a própria inspeção visual desta fase:

- **Sintoma**: a listagem de Clientes mostrava todos os 15 clientes como "Novo lead" / "Não atribuído", mesmo os 8 que já tinham negociação ativa em outros estágios no Pipeline.
- **Causa raiz**: `Person.pipelineStage` e `Person.assignedMemberId` (campos deliberadamente independentes de `PropertyInterest.stage`/`responsibleMemberId`, por doutrina já documentada no schema do produto) nunca eram setados pelo seed.
- **Correção**: `prisma/seed-demo.ts` passou a atualizar esses dois campos ao criar cada negociação, mantendo a ficha do cliente coerente com o Pipeline.
- **Por que não é bug de produto**: os dois conceitos (estágio do funil do cliente vs. estágio da negociação específica) são intencionalmente distintos — um cliente pode estar "em proposta" numa negociação e "novo lead" ainda sem contato real para outro imóvel. O produto já documenta isso explicitamente na própria interface. O ajuste foi inteiramente no script de geração de dados fictícios, nunca no código do CRM.

## Limitação conhecida — fotografias

As 12 fotos de imóveis são **placeholders gerados** (SVG determinístico, ícone de casa + título), não fotografias reais. Ver `docs/comercial/demo/02-inventario-cenario.md` e a justificativa completa em `06-checklist-funcional.md` (DEMO-003) e `08-recomendacoes.md`. Visualmente limpos e sem erro de carregamento, mas claramente não substituem fotos profissionais numa demonstração real a um cliente.

## O que não foi alterado

Nenhum componente do design system foi modificado. Nenhuma tela foi redesenhada. Nenhuma correção de UX/UI foi necessária além do ajuste de dados acima — as telas já estavam maduras e consistentes (resultado já esperado, dado o histórico de homologação visual nas Fases 105 e 108 desta mesma sessão de desenvolvimento).
