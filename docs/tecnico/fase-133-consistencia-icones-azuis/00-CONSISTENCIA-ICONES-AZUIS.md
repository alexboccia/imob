# Fase 133 — Consistência visual: ícones azuis nas páginas já redesenhadas

Status: implementado, testado e publicado.

## Contexto

Ao continuar a varredura de "aplicar o mesmo padrão visual em todas as
páginas administrativas" (Fases 130-132), encontrei uma inconsistência
em duas páginas que já tinham sido redesenhadas ANTES da convenção do
ícone azul existir:

- **Editar imóvel** (`ImovelForm.tsx`, Fase 129): a barra de navegação
  horizontal e o botão "Salvar alterações" já eram azuis, mas os 9
  cabeçalhos de seção do formulário (Identificação, Divulgação,
  Endereço, Valores, Medidas e cômodos, Características, Fotos,
  Materiais de apresentação, O que tem por perto) continuavam com o
  ícone neutro/cinza padrão — uma mistura de dois estilos na MESMA
  página.
- **Ficha do cliente** (Fase 128/128.1): o avatar e os KPIs do
  cabeçalho já usavam azul explícito, mas os 10 cabeçalhos de seção
  (Visão geral: Informações do cliente, Estágio no funil, Próxima
  ação, Observações, Última interação, Preferências de imóvel
  (resumo), Imóveis recomendados; aba Imóveis: Imóveis recomendados,
  Imóveis relacionados; aba Preferências: Preferências de imóvel)
  tinham o mesmo problema.

## O que mudou

Adicionado `tom="azul"` (prop já existente desde a Fase 130) a todos
os 19 cabeçalhos de seção identificados acima, em 3 arquivos:
`src/components/admin/ImovelForm.tsx` (9), `src/app/app/clientes/[id]/page.tsx`
(3) e `src/components/admin/cliente/ClienteVisaoGeral.tsx` (7).

Nenhuma outra mudança — zero lógica, zero estrutura, só o prop de cor
nos ícones que já existiam.

## O que NÃO mudou (deliberado)

- `PreferenciaImovelForm.tsx` tem vários `CabecalhoSecao` internos, mas
  todos sem `icone` (usam `nivel={3}`, sub-cabeçalhos sem badge) — o
  prop `tom` não teria nenhum efeito visual ali, então não foi tocado.
- Componentes de páginas ainda não redesenhadas (Dashboard — Central
  de trabalho/equipe —, Minhas comissões, Captações, Empreendimentos,
  Novos contatos, Pipeline, Tipos de imóvel) continuam neutros — serão
  tratados quando essas páginas passarem pela própria fase de
  redesenho, não nesta varredura de correção pontual.

## Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` — sem erros.
- `npm run build` — sem erros.
- `npx vitest run` — 3895/3895 passando.
- `tests/e2e/imoveis.spec.ts` — 52/52 passando.
- `tests/e2e/ficha-cliente-estrutura.spec.ts` — 14/14 passando.
- `tests/e2e/editar-cliente.spec.ts` — 1 teste falhou
  ("editar nome e e-mail: a ficha reflete os novos valores depois de
  salvar"). **Confirmado, via `git stash` e reexecução contra o HEAD
  limpo (sem nenhuma mudança desta fase), que essa falha já existia
  antes de qualquer alteração minha** — é uma ambiguidade pré-existente
  do seletor do teste (`getByText` resolve para 2 elementos: um texto
  solto e um "E-mail: ..." que o contém), não uma regressão desta fase.
  Os demais 15 testes do arquivo passaram normalmente.
- `tests/e2e/clientes.spec.ts` — passando (incluído na mesma rodada).

## Evidência visual

`evidencias/imovel-azul-1440.png` — seção "Identificação" com ícone
azul, consistente com a navegação e o botão de salvar já azuis.

`evidencias/cliente-azul-1440.png` — os 6 cabeçalhos de seção visíveis
na aba "Visão geral" todos com ícone azul.
