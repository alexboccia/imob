# Fundação visual do backoffice

Componentes compartilhados do painel administrativo, criados na Fase 65 e
usados primeiro no Dashboard (página-piloto). As demais telas migram
progressivamente — nenhuma foi alterada só para antecipar trabalho.

| Componente | Existe porque |
|---|---|
| `CabecalhoPagina` | `<h1>` + subtítulo repetido em 23 páginas |
| `CabecalhoSecao` | `<h2>` + subtítulo repetido 3× só no Dashboard; `CentralTrabalho` mantinha um `TituloBloco` local pelo mesmo motivo |
| `EstadoVazio` | cada bloco resolvia o vazio do seu jeito; "não há nada aqui" ora parecia informação, ora erro de carregamento |
| `CartaoEstatistica` + `GradeEstatisticas` | **oito** componentes de KPI quase idênticos no projeto |
| `BarraSegmentada` + `classesItemSegmentado` | três conjuntos de opções com o mesmo visual e semânticas diferentes |

Todos **compõem** o design system existente (`ui/card`, `ui/button`,
`ui/badge`, tokens de `globals.css`). Não são um segundo design system, e
nenhum deles reimplementa primitivo que já exista.

## Regra central das abas

> Organizar em abas quando houver contextos conceitualmente distintos e
> isso melhorar a navegação — nunca criar abas apenas para esconder
> conteúdo ou reduzir rolagem.

Abas **não** servem para diminuir scroll, esconder poucos campos ou partir
um conteúdo que pertence ao mesmo fluxo. Quando os grupos não forem
contextos distintos, use seções, cards ou grid.

Quando forem abas de verdade, use o padrão de `AbasConfiguracoes`:
`role="tablist"`, `aria-selected`, `aria-controls`, roving tabindex, setas
←/→ e — quando o estado fizer sentido ser compartilhado — deep link.

Atenção à semântica: `BarraSegmentada` é só a moldura. Um conjunto de
links navegáveis é `<nav>` + `aria-current`, não um tablist; um toggle de
estado local é `<button aria-pressed>`. Reaproveite a aparência, nunca a
semântica errada.

## Antes de redesenhar uma página administrativa

Começar pela arquitetura da informação, nunca pelo CSS:

1. identificar as tarefas principais da tela;
2. identificar os grupos de informação;
3. identificar a hierarquia entre eles;
4. identificar ações primárias e secundárias;
5. identificar padrões já reutilizáveis;
6. avaliar se abas são apropriadas (ver regra acima);
7. avaliar os estados vazios;
8. avaliar a responsividade (incluindo a coluna real atrás da sidebar);
9. preservar funcionalidade, dados, permissões e multi-tenancy;
10. só então reorganizar visualmente.

## Larguras que sempre mordem

A sidebar fixa ocupa 224px até `md`. Em 360-390px de viewport a coluna
real de conteúdo fica em ~88-118px — é onde rótulos colapsam a 0px e
palavras quebram caractere a caractere. Todo componente daqui já nasce com
`min-w-0` e `break-words` por causa disso.
