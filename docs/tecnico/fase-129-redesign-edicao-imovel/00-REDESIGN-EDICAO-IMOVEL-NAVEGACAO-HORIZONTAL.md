# Fase 129 — Redesign da tela de edição de imóveis: navegação horizontal

Status: implementação técnica concluída, aguardando homologação visual do
proprietário. **Nenhum commit, push, migration ou deploy foi feito** —
autorização explícita da tarefa reservava a publicação para depois da
homologação.

## O que mudou

A tela `/app/imoveis/[id]` ganhou:

1. **Barra de navegação horizontal** com as 7 seções do formulário
   (Identificação, Divulgação, Endereço, Valores, Medidas e cômodos,
   Características, Fotos e mídia), substituindo a ideia de menu lateral
   vertical. Todas as seções continuam **montadas o tempo todo** — a
   barra só rola a página até a seção e destaca o item ativo (nunca
   abas que desmontam conteúdo).
2. **Cabeçalho novo**: "← Voltar para imóveis", título "Editar imóvel" +
   subtítulo, e 4 ações à direita (Visualizar, Arquivar, Excluir
   definitivamente, Salvar alterações — CTA principal, azul).
3. **Card de resumo horizontal** abaixo do cabeçalho: foto de capa (com
   botão "Ver fotos (N)" que rola até a seção Fotos, sem abrir um
   segundo visualizador), título/localização, selo de status, e os
   valores financeiros (Venda ou Aluguel conforme a finalidade,
   Condomínio, IPTU) com o código do imóvel no canto.

Nenhuma regra de negócio, campo ou fluxo de salvamento foi duplicado ou
removido — tudo reaproveita os componentes e Server Actions já
existentes (arquivamento, exclusão definitiva, Kit de Divulgação, mapa/
geocodificação, upload e gestão de mídia, etc.).

A tela de **cadastro** (`/app/imoveis/novo`) não foi tocada: o novo
cabeçalho/resumo/navegação só aparece quando `ImovelForm` recebe a prop
opcional `edicao`, passada apenas pela página de edição.

## Divergência da referência: horizontal vs. vertical

O brief escrito pedia explicitamente uma "barra de navegação horizontal
com sete seções" ("substituir o menu vertical secundário por uma barra
de navegação horizontal"), mas a imagem de referência anexada mostrava
as 7 seções como uma lista vertical à esquerda do formulário.

Essa contradição foi explicitada ao proprietário antes de qualquer
implementação (em vez de escolher uma interpretação silenciosamente).
Resposta recebida: **"Horizontal, como o texto pede"** — a imagem foi
usada como referência para os demais elementos (cabeçalho, card de
resumo, cores, ícones), mas não para a estrutura de navegação em si.

## Arquitetura

### Componentes novos

- `src/lib/scroll-secao.ts` — `rolarParaSecaoImovel(id)`: rola até uma
  seção por id, respeitando `prefers-reduced-motion`. Reaproveitado
  pela barra de navegação e pelo botão "Ver fotos".
- `src/lib/imovel-navegacao.ts` — `SECOES_IMOVEL`: lista única das 7
  seções (id, rótulo, ícone), fonte de verdade para a barra de
  navegação e para os ids/âncoras no formulário.
- `src/components/admin/imoveis/NavegacaoHorizontalImovel.tsx` — a
  barra sticky, com scrollspy (ver abaixo).
- `src/components/admin/imoveis/BotaoVerFotos.tsx` — botão sobreposto à
  foto de capa do card de resumo.
- `src/components/admin/imoveis/ResumoImovelCard.tsx` — o card de
  resumo horizontal.
- `src/components/admin/imoveis/CabecalhoEdicaoImovel.tsx` — o
  cabeçalho novo (breadcrumb, título, 4 ações).

### Componentes modificados

- `src/components/admin/BotaoSalvarImovel.tsx` — ganhou um `rotulo`
  opcional ("Salvar alterações" na edição; "Salvar imóvel" continua
  sendo o padrão do cadastro). É renderizado **duas vezes** na mesma
  árvore (cabeçalho e rodapé do formulário) — ambas as instâncias
  compartilham o mesmo `useFormStatus()` porque o pai comum é o
  `<form>`, então nunca há dois fluxos de salvamento.
- `src/components/admin/ImovelForm.tsx` — ganhou a prop opcional
  `edicao` (cabeçalho, resumo e navegação só renderizam quando
  presente); cada uma das 7 seções do menu ganhou `id="secao-..."` e
  `scroll-mt-20` (compensa a barra sticky ao rolar até a âncora); a
  seção "Divulgação" ganhou um slot de ação (`acoes`) para hospedar o
  botão do Kit de Divulgação, que saiu do cabeçalho antigo.
- `src/app/app/imoveis/[id]/page.tsx` — removeu o `CabecalhoPagina`
  antigo; monta a prop `edicao` (capa e contagem de fotos vêm de
  `imovel.media`, já ordenada por `isCover`; o restante reaproveita
  dados já carregados pela própria página).
- `src/lib/format.ts` — `STATUS_IMOVEL_BADGE_CLASSE`: mapa de classes
  para o selo de status do card de resumo. Só "Reservado" ganha verde
  (`bg-success-muted`); os demais status mantêm o estilo neutro padrão
  do `Badge`, sem paleta nova inventada.

### Scrollspy: da tentativa com `IntersectionObserver` ao scroll real

A primeira implementação usava `IntersectionObserver` com `threshold`
fixo, escolhendo a seção com maior `intersectionRatio` entre os
`entries` de cada callback. Essa abordagem tinha um bug real, encontrado
com Playwright (não hipotético): uma seção curta (Características,
~140px) cruza muitos mais limiares de `threshold` ao atravessar a zona
de ativação do que uma seção alta (Fotos, >1000px, cuja razão de
interseção nunca passa de ~0.3) — o destaque ficava preso na seção
curta, mesmo com a rolagem já tendo terminado bem abaixo dela, porque
nenhum novo callback chegava para corrigir.

A solução final é posicional e reage ao evento `scroll` da janela (via
`requestAnimationFrame`, não a cada pixel): a cada recálculo, a seção
"ativa" é a última, na ordem do documento, cujo topo já cruzou uma
linha fixa logo abaixo da barra sticky. Isso elimina qualquer
dependência de razão de interseção e converge sempre para a posição
real de repouso da rolagem, tanto por clique (`scrollIntoView`) quanto
por rolagem manual do usuário.

Clique num item da barra marca o item ativo imediatamente (sem esperar
o próximo evento de scroll) e suspende o recálculo por ~700ms, para o
destaque não "brigar" visualmente com a animação suave do
`scrollIntoView`.

## Responsividade — achados reais (medidos com Playwright)

- **Cabeçalho e card de resumo**: a divisão foto+texto e a linha de
  valores financeiros usavam breakpoints `sm:`/`md:`/`lg:` que
  pareciam razoáveis, mas a sidebar fixa do backoffice (224px, some só
  abaixo de 768px — ver `src/app/app/layout.tsx`) deixa menos largura
  utilizável do que o breakpoint do Tailwind sugere. Testado e
  corrigido em 768px e 1024px, onde o layout chegava a estourar a
  página — o ponto real de sobra de espaço é `xl:` (1280px), mesmo
  padrão já usado na Fase 128.1 para o cabeçalho da ficha do cliente.
- **Barra de navegação**: `overflow-x-auto` isolado (não quebra linha,
  não estoura a página — o scroll fica contido na própria barra),
  testado em 390/375px.
- Breakpoints verificados sem overflow de documento: 1920, 1440, 1366,
  1024, 768, 390, 375px (capturas em `imagens/`).

## Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` nos arquivos tocados — sem erros.
- `npm run build` — build de produção completo, sem erros.
- `npx vitest run` — 208 arquivos, 3895 testes, todos passando.
- E2E (Playwright, build de produção): `imoveis.spec.ts`,
  `anuncio-imovel.spec.ts`, `materiais-imovel.spec.ts`,
  `locais-proximos.spec.ts`, `observacao-valor.spec.ts`,
  `frase-destaque.spec.ts`, `galeria-editorial.spec.ts`,
  `empreendimento.spec.ts`, `preferencia-imovel.spec.ts` — todos
  passando (duas falhas pontuais, não reprodutíveis isoladamente,
  identificadas como instabilidade pré-existente da suíte, não
  relacionadas a esta mudança).
- Testes existentes atualizados para refletir o novo rótulo do botão
  de salvar na edição ("Salvar alterações" em vez de "Salvar imóvel")
  e a nova ambiguidade de haver dois botões com o mesmo nome acessível
  na página (cabeçalho + rodapé) — `.first()` adicionado nos cliques
  afetados, sempre em specs cujo fluxo já navegava para a página de
  EDIÇÃO (a página de cadastro não foi alterada).
- Verificado manualmente, com Playwright real (Chromium): clique em
  cada um dos 7 itens da barra ativa o item correto (`aria-current`) e
  rola até a seção visível; rolagem manual (scroll da roda do mouse)
  também converge para o item correto; valores digitados num campo
  (ex. Título) sobrevivem à navegação entre seções (prova de que nada é
  desmontado/remontado).

## Pendências antes da publicação

- Homologação visual do proprietário contra o protótipo aprovado.
- Autorização explícita para commit/push/deploy (não dada nesta
  tarefa).
