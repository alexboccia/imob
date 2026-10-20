# Redesign da tela de detalhes do cliente — EasyMob

Implementação local, testada e documentada da reestruturação completa da
ficha `/app/clientes/[id]` em abas, conforme a autorização "EASYMOB —
REDESIGN COMPLETO DA TELA DE DETALHES DO CLIENTE". **Não publicado em
produção** — autorização explícita limitou este trabalho a
desenvolvimento e testes locais, aguardando homologação visual.

**Atualização — imagem de referência recebida após a primeira entrega**:
a imagem original (perdida na compactação de contexto, ver seção 8) foi
reenviada pelo usuário. Esta versão incorpora uma segunda rodada de
ajustes de fidelidade a partir da comparação direta com ela: abas em
formato de pílula com ícone (ativa = azul sólido), cabeçalho e KPIs no
mesmo cartão horizontal, badge "Cliente ativo"/"Arquivado" (derivado de
`archivedAt`), ícone de WhatsApp no telefone, resumo de preferências em
lista rotulada (ícone + rótulo + valor), fotos reais de capa nos cards
de recomendação (antes só placeholder), badge de compatibilidade em
verde, botão "Ver imóvel" em estilo outline, e links "Ver todas"/"Ver
todos (N)"/"Ver histórico" no cabeçalho de cada seção em vez de botões
no corpo do card.

## 1. Arquitetura final

A ficha deixou de ser uma lista única de seções empilhadas e passou a
ter:

1. **Barra superior** — link "Voltar para clientes" à esquerda;
   Arquivar/Excluir definitivamente/Editar à direita (mesmos componentes
   e permissões de sempre: `GerenciarArquivamentoRegistro`,
   `EditarClienteDialog`).
2. **Cartão de identificação** (`ClienteCabecalhoIdentificacao`) —
   avatar com inicial, nome, telefone/e-mail, badge de papel
   (`PAPEL_LABEL`), badge de estágio no funil (`ESTAGIO_LABEL`/
   `ESTAGIO_BADGE_CLASSE`, já existentes), badge "Arquivado" quando
   aplicável, "Cliente desde", e o widget de responsável transferível
   (`PosseContato`, reusado sem alteração).
3. **3 KPIs** (`ClienteIndicadores`, sobre o `CartaoEstatistica`/
   `GradeEstatisticas` já existentes no design system) — Imóveis
   relacionados, Imóveis recomendados, Última interação. Todos
   derivados de dados já carregados pela página (nenhuma contagem
   aproximada).
4. **4 abas horizontais** (`ClienteAbas`, sobre um novo wrapper
   `src/components/ui/tabs.tsx` do primitivo `@base-ui/react/tabs`) —
   Visão geral / Preferências / Imóveis / Histórico. Teclado (setas/Home/
   End) e ARIA corretos (herdados do primitivo). Aba ativa destacada em
   azul (`data-[selected]:text-blue-700`/`border-blue-600`).

### Estado da aba ativa e URL

`ClienteAbas` é client-side e guarda a aba ativa em `useState`,
refletindo-a na URL via `history.replaceState` (nunca
`router.push`/`replace` do Next) — trocar de aba não dispara uma nova
renderização do Server Component da página nem refaz a busca ao banco.
A URL fica compartilhável/copiável (`?aba=preferencias` etc.) e volta a
abrir na aba certa num reload ou numa nova visita ao mesmo link; sem o
parâmetro, cai em "Visão geral".

### Conteúdo por aba — montagem única

Cada painel só é renderizado quando é a aba ativa (renderização
condicional explícita em `ClienteAbas`, não o `keepMounted` interno do
Base UI — achado real da homologação: sem nenhuma transição CSS
configurada, o hook de transição do primitivo nunca completava e o
painel anterior ficava montado/acessível para sempre, fazendo a Visão
geral e a aba ativa responderem simultaneamente à mesma busca de
heading). Os DADOS de todas as abas continuam vindo de uma ÚNICA leitura
no servidor (como a ficha sempre fez); o que passou a ser parcial é só o
DOM/acessibilidade montados por vez.

### Troca de aba a partir de outro painel

Botões como "Registrar atendimento"/"Relacionar imóvel" (card Próxima
ação, Visão geral) e "Ver todas"/"Ver todos" (resumos) trocam de aba sem
navegar, via um contexto React (`AbaClienteContext`) provido por
`ClienteAbas` e consumido por um botão fino (`BotaoIrParaAba`). Como o
contexto é só uma árvore de componentes React, funciona mesmo com
conteúdo renderizado no servidor entre o Provider e o botão.

## 2. Componentes criados

- `src/components/ui/tabs.tsx` — wrapper de design system sobre
  `@base-ui/react/tabs` (mesmo padrão de `combobox.tsx`/`select.tsx`).
- `src/lib/cliente-abas.ts` — lista das 4 abas e validação do valor da
  URL, importado tanto pela página (Server Component) quanto pelo
  controlador client.
- `src/components/admin/cliente/ClienteAbas.tsx` — controlador de abas.
- `src/components/admin/cliente/AbaClienteContext.tsx` — contexto para
  trocar de aba a partir de qualquer descendente.
- `src/components/admin/cliente/BotaoIrParaAba.tsx` — botão que troca de
  aba via o contexto acima.
- `src/components/admin/cliente/ClienteCabecalhoIdentificacao.tsx` —
  cartão de identificação.
- `src/components/admin/cliente/ClienteIndicadores.tsx` — os 3 KPIs.
- `src/components/admin/cliente/ClienteVisaoGeral.tsx` — grade de 2
  colunas da aba Visão geral.
- `src/components/admin/cliente/ResumoPreferencias.tsx` — resumo
  compacto de preferências com badges + "+N" de overflow.

## 3. Componentes reusados sem alteração de comportamento

`PosseContato`, `GerenciarArquivamentoRegistro`, `EditarClienteDialog`,
`RelacionarImovelForm`, `InteresseImovelItem`, `CartaoEstatistica`/
`GradeEstatisticas`, `CabecalhoSecao`, `EstadoVazio`, `Avatar`/
`AvatarFallback`, `Card`, `Badge`, `Select`.

## 4. Componentes alterados

- **`PreferenciaImovelForm.tsx`** — reorganizado em 6 seções com
  cabeçalho próprio (A) Finalidade e tipo, B) Localização, C) Orçamento,
  D) Características do imóvel, E) Características do condomínio, F)
  Observações), em grade de 2 colunas no desktop / 1 no mobile.
  Continua sendo UM `<form>`/UMA action só — nenhum campo, validação,
  valor ou mensagem de erro/sucesso mudou. Corrigido de quebra um achado
  real da própria homologação: o `<SelectValue>` de Finalidade não tinha
  `children` e mostrava o valor cru do enum ("SALE") em vez do rótulo
  ("Comprar") — mesma classe de bug já corrigida em outros pontos da
  ficha antes desta fase, agora também aqui.
- **`RecomendacaoImovelItem.tsx`** — ganhou uma variante `compacta`
  (preview da Visão geral: ícone-placeholder, localização, preço, área,
  "Ver critérios atendidos" que troca de aba em vez de expandir) ao lado
  da variante `completa` (inalterada na aba Imóveis, critérios sempre
  presentes). A caixa de imagem é sempre um placeholder consistente —
  nenhuma foto real do imóvel é buscada ou inventada. Localização/área
  só aparecem na variante compacta: a variante completa mantém o
  comportamento já existente (critérios soft, como cidade/bairro/área,
  escondidos atrás do `<details>` "Ver critérios de compatibilidade" até
  o clique — duplicá-los fora dele vazaria informação que a Fase 98
  deliberadamente mantinha oculta).
- **`src/app/app/clientes/[id]/page.tsx`** — reescrita para montar o
  novo cabeçalho/KPIs/abas em vez da lista única de seções. A busca ao
  banco (o `Promise.all` com `withOrganization`) é a mesma, sem nenhuma
  query nova nem removida.

## 5. Organização por aba

- **Visão geral** (padrão) — grade 2 colunas: Informações do cliente /
  Estágio no funil (linha 1); Próxima ação / Observações + Última
  interação (linha 2); Preferências (resumo) / Imóveis recomendados
  (preview, até 3) (linha 3).
- **Preferências** — o formulário completo, em 6 seções.
- **Imóveis** — Imóveis recomendados (lista completa, critérios sempre
  visíveis por padrão de atendidos, com disclosure para os demais) e
  Imóveis relacionados (ferramenta "Relacionar imóvel" + lista de
  negociações), como duas seções claramente separadas.
- **Histórico** — "Registrar nova interação" no topo, timeline completa
  abaixo.

## 6. Funcionalidade preservada

Autenticação/autorização, isolamento multi-tenant, permissões de
arquivamento/exclusão definitiva, transferência de responsável (pessoa
e negociação, duas coisas distintas, preservadas como tal), estágio no
funil, observações, preferências (schema e regras intocados), algoritmo
de recomendação (`property-matching.ts` não foi alterado em sua lógica,
só em labels), relacionar/remover imóvel, integração com Pipeline,
registro e histórico de interações, oportunidades a partir de interação
de captação, logs de auditoria (sistema separado, não tocado).

## 7. Testes

- `npx tsc --noEmit` — sem erros.
- `npm run build` — build de produção completo, sem erros.
- `npx vitest run` — 208 arquivos / 3895 testes, 100% passando
  (nenhum teste unitário/integração precisou de alteração: a lógica de
  dados não mudou).
- E2E direcionados (os que tocam a ficha do cliente e o fluxo de
  relacionar/responsável/comissão/fechamento/pipeline que passam por
  ela): `ator-transicao`, `autor-interacao`, `comissao`, `follow-up`,
  `liquidacao`, `participacao`, `pipeline`, `preferencia-imovel`,
  `relacionar-imovel-cliente`, `responsavel`, `serializacao`,
  `valor-fechamento` — **127 de 128 passando** na bateria final. Todos
  precisaram de uma troca de aba explícita (`getByRole("tab", ...)`)
  antes de interagir com conteúdo que mudou de seção para aba; o teste
  de hierarquia de cabeçalhos e o de estados vazios foram reescritos
  para checar cada aba separadamente, já que as duas seções que antes
  coexistiam na mesma tela agora vivem em abas distintas por desenho.
  A única falha remanescente (`pipeline.spec.ts`, linha 16) é o mesmo
  flake de carga concorrente já identificado e aceito em fases
  anteriores desta mesma sessão — passa de forma determinística em
  isolamento (confirmado 2x nesta fase) e falha em pontos diferentes a
  cada execução em lote, características de contenção de recursos sob
  carga, não de lógica quebrada.
- Homologação visual real via Playwright+Chromium, com a organização
  `e2e-org-inbox` (cliente `Wanda Compativel`, com preferência e 4
  recomendações reais) e a organização A (cliente sem preferências,
  cobrindo o estado vazio) em 1440/1024/768/390px — evidências em
  `docs/tecnico/imagens/fase-128-redesign-cliente/` (`visao-geral-*.png`,
  `aba-Preferências.png`, `aba-Imóveis.png`,
  `compativel-visao-geral.png`, `compativel-aba-Preferências.png`,
  `compativel-aba-Imóveis.png`).

## 8. Diferenças em relação à imagem de referência

A imagem de referência não ficou disponível na primeira rodada desta
fase (compactação de contexto); a primeira entrega seguiu a
especificação TEXTUAL completa (17 seções) que acompanhava o brief
original. O usuário reenviou a imagem depois, e uma segunda rodada
(documentada no topo deste arquivo) fechou a maior parte da distância
visual: abas em pílula com ícone, cabeçalho+KPIs no mesmo cartão, badge
"Cliente ativo", resumo de preferências em lista rotulada, fotos reais
de capa, badge de compatibilidade verde, "Ver imóvel" em outline, e
links de cabeçalho ("Ver todas"/"Ver todos (N)"/"Ver histórico").

Diferenças remanescentes, deliberadas ou de baixo risco:

- **Placeholder quando não há foto**: a especificação por escrito
  permite explicitamente "placeholder consistente quando não houver
  imagem" — mantido para imóveis sem nenhuma foto cadastrada (a busca
  de foto real, adicionada nesta rodada, só preenche quando existe).
- **"Responsável" como pílula de dropdown**: a imagem mostra um controle
  parecido com `<select>`; esta implementação manteve o mecanismo REAL
  de transferência de responsável (`PosseContato`, com diálogo de busca
  e autorização), só reposicionado — trocar a interação por um `<select>`
  simples trocaria uma ação validada/auditada por uma mais pobre, o que
  a autorização pediu para não fazer ("preservar... transferência de
  responsável").
- **"Responsável" não duplicado no card "Informações do cliente"**: a
  imagem mostra o mesmo controle duas vezes (cabeçalho e card); mantido
  uma vez só (cabeçalho) para não duplicar um controle com estado
  próprio (dois `PosseContato` na mesma tela controlando a mesma coisa
  seria uma fonte de confusão, não fidelidade).
- **KPIs sem link de navegação**: cartões estáticos (mesmo em ambas as
  imagens) — a especificação não pediu navegação neles.

Nenhuma funcionalidade existente foi removida ou simplificada; nenhum
dado foi substituído por estático. Evidências da segunda rodada:
`final2-visao-geral-1440.png`, `final2-visao-geral-390.png`,
`final2-aba-Preferências.png`, `final2-aba-Imóveis.png`,
`final2-aba-Histórico.png` (em `docs/tecnico/imagens/fase-128-redesign-cliente/`).

## 9. Pendências / próximos passos

- **Homologação visual pelo usuário** antes de qualquer commit/push/
  deploy — autorização explícita excluiu a publicação em produção desta
  fase.
- Caso o usuário aprove, falta apenas: `git add` escopado aos arquivos
  desta fase (ver lista abaixo), commit e push — nenhuma migração de
  banco é necessária (nenhum campo de schema mudou).

## 10. Estado do git

HEAD em `4203b49` no início desta fase (mesmo commit da fase anterior).
Arquivos tocados por esta fase, isolados das ~35 alterações pré-
existentes de outras fases (Demo, R2, Billing, Neon, etc., todas
preservadas intocadas):

```
Modificados:
  src/app/app/clientes/[id]/page.tsx
  src/components/admin/PreferenciaImovelForm.tsx
  src/components/admin/RecomendacaoImovelItem.tsx
  tests/e2e/ator-transicao.spec.ts
  tests/e2e/autor-interacao.spec.ts
  tests/e2e/comissao.spec.ts
  tests/e2e/follow-up.spec.ts
  tests/e2e/liquidacao.spec.ts
  tests/e2e/participacao.spec.ts
  tests/e2e/pipeline.spec.ts
  tests/e2e/preferencia-imovel.spec.ts
  tests/e2e/relacionar-imovel-cliente.spec.ts
  tests/e2e/responsavel.spec.ts
  tests/e2e/serializacao.spec.ts
  tests/e2e/valor-fechamento.spec.ts

Novos:
  src/components/ui/tabs.tsx
  src/lib/cliente-abas.ts
  src/components/admin/cliente/ (7 arquivos)
  docs/tecnico/fase-128-redesign-cliente/00-REDESIGN-FICHA-CLIENTE.md
  docs/tecnico/imagens/fase-128-redesign-cliente/ (evidências)
```

Nenhuma migração, nenhuma credencial, nenhum dado real alterado.
