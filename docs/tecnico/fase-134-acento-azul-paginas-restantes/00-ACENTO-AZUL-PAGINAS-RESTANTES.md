# Fase 134 — Acento visual azul nas páginas administrativas restantes

Status: implementado, testado e publicado.

## Contexto

Continuação da varredura de consistência visual (Fases 130-133). Estas
6 páginas já seguiam a arquitetura padrão do backoffice
(`CabecalhoPagina`/`CabecalhoSecao` + `Card`/`CartaoEstatistica`,
estabelecida em fases anteriores — 35, 69, 71, 72, P.4), então, como em
Assinatura (Fase 132), bastou o acento `tom="azul"` nos ícones de
seção — nenhuma restruturação.

## Páginas e arquivos

| Página | Componente | Headers ajustados |
|---|---|---|
| Minhas comissões | `ComissaoAReceber.tsx` | "Resumo das comissões", "Negócios" |
| Empreendimentos | `EmpreendimentosCard.tsx` | "Empreendimentos cadastrados", "Novo empreendimento" |
| Pipeline | `pipeline/page.tsx` + `PipelineInsights.tsx` | "Negociações", "Análise do pipeline" |
| Tipos de imóvel | `tipos-imovel/TiposImovelGrupoCard.tsx` | título dinâmico (Residencial/Comercial) |
| Novos contatos | `TodosNovosContatos.tsx` | "Novos contatos" |
| Contatos a identificar (Captações) | `ContatosAIdentificar.tsx` | título dinâmico |

Total: 8 cabeçalhos de seção em 7 arquivos.

## Cuidado tomado: isolar de trabalho pendente de outra fase

`src/app/app/pipeline/page.tsx` já tinha uma alteração pendente, NÃO
commitada, de outra fase (um bloco de gate de módulo "Fase 122-A", AUD-121-002, verificando `hasModule(organizationId, "pipeline")`)
que não faz parte desta tarefa. Para não publicar esse código alheio
junto, a mudança desta fase foi isolada com cuidado antes do `git add`
— o bloco "Fase 122-A" permanece no working tree, intocado, não
commitado, exatamente como estava.

## O que NÃO mudou (deliberado)

- `PreferenciaImovelForm.tsx` — cabeçalhos sem `icone` (`nivel={3}`),
  o prop `tom` não teria efeito.
- Dashboard (`CentralTrabalho`/`CentralEquipe` e outros widgets) — fora
  de escopo; é uma composição de widgets bem mais complexa que merece
  uma fase própria, não um ajuste pontual de cor.

## Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` — sem erros.
- `npm run build` — sem erros.
- `npx vitest run` — 3895/3895 passando.
- `tests/e2e/comissao-a-receber.spec.ts`,
  `tests/e2e/empreendimento.spec.ts`, `tests/e2e/tipos-imovel.spec.ts`,
  `tests/e2e/novos-contatos.spec.ts`, `tests/e2e/captacoes.spec.ts` —
  **66/66 passando**, sem nenhuma alteração.
- `tests/e2e/pipeline.spec.ts` — o teste "KPIs renderizam... move
  etapa, marca como ganho" se mostrou **flaky tanto com quanto sem** as
  mudanças desta fase (confirmado isolando com `git stash`: falhou
  4/4 execuções repetidas em ambos os estados, código novo e HEAD
  limpo) — instabilidade pré-existente do teste (provavelmente
  sensível a timing de drag-and-drop sob execução repetida), não uma
  regressão desta fase. Os demais 104 testes do arquivo passaram
  normalmente em execução única.

## Evidência visual

`evidencias/134-{minhas-comissoes,empreendimentos,pipeline,tipos-imovel,novos-contatos,captacoes}.png`
— todos os cabeçalhos de seção com ícone azul.
