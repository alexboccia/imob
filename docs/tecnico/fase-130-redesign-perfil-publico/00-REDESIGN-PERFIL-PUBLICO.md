# Fase 130 — Redesign da página "Meu perfil público"

Status: implementação técnica concluída, aguardando homologação visual
do proprietário. **Nenhum commit, push, deploy ou migration foi feito**
— autorização explícita da tarefa reservava a publicação para depois da
homologação.

## A. Implementação

### O que mudou

A tela `/app/meu-perfil` (autoatendimento do corretor sobre o próprio
perfil público) passou de um único `<fieldset>` para **4 cards
independentes**, seguindo a referência visual aprovada e o mesmo design
system já usado na Fase 129 (redesign da edição de imóvel):

1. **Perfil público** — bloco informativo de privacidade + switch "Exibir
   este profissional no site público".
2. **Foto pública** — upload com moldura maior (128px, cantos
   arredondados) e texto real de formatos/limite aceitos.
3. **Informações de contato** — CRECI, WhatsApp, Telefone e E-mail
   públicos, em grade de 2 colunas no desktop.
4. **Apresentação** — biografia com contador de caracteres dinâmico
   (`N/600`) e, no rodapé, o link "Ver este perfil no site" + o botão
   "Salvar alterações" (CTA azul, único fluxo de salvamento da tela).

A tela de **gestão de usuários** (`/app/usuarios/[id]`, que edita o
perfil público de QUALQUER membro) não foi tocada: continua usando
`PerfilPublicoCorretorFields`/`FotoCorretorUpload` na variante compacta
de sempre. As duas telas continuam escrevendo a mesma action
(`salvarMeuPerfilPublico` aqui; `atualizarUsuario` lá) e o mesmo schema
(`perfilPublicoSchema`), sem nenhuma mudança de contrato.

### Arquivos alterados

- `src/components/admin/MeuPerfilPublicoForm.tsx` — reescrito: em vez
  de `<PerfilPublicoCorretorFields>`, orquestra os 4 cards novos dentro
  do MESMO `<form action={formAction}>` de sempre (um só fluxo de
  salvamento, via `useActionState`).
- `src/components/admin/FotoCorretorUpload.tsx` — ganhou um prop
  `variante?: "compacta" | "grande"` (padrão `"compacta"`, comportamento
  inalterado para a gestão de usuários). Na variante `"grande"`
  (só usada aqui), a moldura passa de 64px circular para 128px com
  cantos arredondados, e aparece um texto com os formatos/limite REAIS
  aceitos pelo servidor (derivados de `upload-validation.ts`, nunca
  digitados à mão).
- `src/components/admin/ui/CabecalhoSecao.tsx` — ganhou um prop
  `tom?: "neutro" | "azul"` (padrão `"neutro"`, idêntico ao que todo o
  resto do backoffice já usa). `"azul"` é só pra esta fase: ícone
  `blue-600` sobre fundo `blue-100`, explícito via Tailwind (não
  `bg-primary`/`text-primary` — o mesmo raciocínio já registrado na Fase
  129: `--primary` é intencionalmente grayscale no backoffice).
- `src/components/ui/switch.tsx` (NOVO) — wrapper do `Switch` do Base UI
  (mesma biblioteca de primitivos que `Checkbox`/`Button` já usam),
  estilizado azul-ligado/cinza-desligado. Submete `"on"`/nada no
  `FormData`, o MESMO contrato que um `<input type="checkbox">` nativo
  — nenhuma mudança na action nem no schema.

### Componentes novos (`src/components/admin/meu-perfil/`)

- `CardPerfilPublico.tsx` — Card 1.
- `CardFotoPublica.tsx` — Card 2.
- `CardContatosPublicos.tsx` — Card 3.
- `CardApresentacao.tsx` — Card 4 (client component — mantém o contador
  de caracteres do textarea).

### Decisões técnicas

- **Checkbox → Switch real, não um checkbox fantasiado**: a referência
  pedia um "switch visual moderno". A alternativa mais simples seria só
  restilizar o `Checkbox` existente (manter `role="checkbox"`); em vez
  disso, o Base UI já expõe um primitivo `Switch` dedicado, com
  `role="switch"` nativo — a semântica ARIA correta para um toggle
  (diferente de um checkbox, que é "marcado/desmarcado", um switch é
  "ligado/desligado"). Como ele submete o mesmo valor de FormData que um
  checkbox, a troca não exigiu NENHUMA mudança em `salvarMeuPerfilPublico`
  nem em `perfilPublicoSchema`. Isso teve um custo: testes que liam
  `[role="checkbox"]` precisaram mudar para `[role="switch"]` (ver seção
  D) — mudança justificada, documentada, não feita "só pra passar".
- **4 cards em vez de 1 fieldset**: elimina o teste de geometria que
  comparava o `<fieldset>` inteiro contra a largura do container — mas o
  `<form>` que envolve os 4 cards ocupa exatamente a mesma largura cheia
  que o fieldset ocupava, então a régua "o formulário acompanha o
  container, não vira coluna estreita" continua válida, só mudando o
  seletor medido.
- **Nenhum limite inventado**: a referência mostrava "máx. 5 MB" e
  "mínimo 400×400px" no card de foto. Conferido em
  `src/lib/upload-validation.ts`: o limite real para imagens é **10 MB**,
  os formatos aceitos são **JPG/JPEG/PNG/WEBP**, e **não existe** nenhuma
  validação de resolução mínima no servidor. O texto exibido reflete
  isso — nunca o que a imagem de referência sugeria.
- **Breakpoint dos campos de contato**: `sm:grid-cols-2` (640px), não a
  container query `@2xl/perfil` que o `PerfilPublicoCorretorFields`
  original usava. Aquela container query existia porque o MESMO bloco de
  campos vivia em duas larguras de container muito diferentes (a
  autogestão, largura do painel inteiro, e a coluna estreita da edição
  de usuário). Os cards desta fase são exclusivos da autogestão (sempre
  largura cheia do painel), então um breakpoint de viewport simples é
  suficiente e mais direto — confirmado sem overstretch em 768px
  (sidebar + 2 colunas cabem com folga, ver capturas).

## B. Fidelidade visual

Capturas reais (Playwright + Chromium, build de produção) em
`imagens/`:

- `perfil-1920.png`, `perfil-1440.png`, `perfil-1366.png`,
  `perfil-1024.png`, `perfil-768.png`, `perfil-390.png` — estado NÃO
  publicado (switch desligado, sem link "Ver perfil").
- `perfil-publicado-1440.png` — estado PUBLICADO (switch ligado em azul,
  contador de bio em "34/600", alerta de sucesso, link "Ver este perfil
  no site" visível ao lado do botão de salvar).

Comparado à referência: 4 cards, ícones azuis sobre fundo azul-claro,
bloco informativo azul-claro, switch azul/cinza, grade de 2 colunas nos
contatos, contador de caracteres dinâmico, CTA azul "Salvar alterações"
— todos presentes e fiéis. Única divergência deliberada: textos de
formato/limite de foto usam os valores REAIS do servidor (10 MB, sem
mínimo de resolução), não os da imagem de referência (ver seção A).

Breakpoints verificados sem overflow de documento: 1920, 1440, 1366,
1024, 768, 390, 375px.

## C. Preservação funcional

Confirmado manualmente com Playwright real (não só testes automatizados):

- Carregamento do perfil com dados existentes.
- Alternar o switch por clique E por teclado (foco + barra de espaço),
  sem perder os demais campos.
- Editar CRECI, WhatsApp, Telefone, E-mail e Apresentação, salvar, e os
  valores persistirem após reload.
- Despublicar sem apagar nenhum campo preenchido.
- Link "Ver este perfil no site" aparece só quando publicado (href
  nulo/ausente quando não) e abre a ficha pública real.
- Contador de caracteres da Apresentação atualiza em tempo real, sem
  travar o cursor do textarea.
- Upload de foto: seleção, preview, substituição, remoção e erro —
  mecanismo idêntico ao da gestão de usuários (mesmo componente,
  variante visual diferente).
- Isolamento: a gestão de usuários (`/app/usuarios/[id]`) continua com o
  checkbox/moldura compacta de sempre — verificado que nenhuma mudança
  desta fase vazou pra lá (34 testes de `usuarios.spec.ts` +
  `perfil-corretor.spec.ts` passando sem alteração).

Nenhuma limitação encontrada.

## D. Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` nos arquivos tocados — sem erros.
- `npm run build` — build de produção completo, sem erros.
- `npx vitest run` — 208 arquivos, **3895 testes, todos passando**
  (inclui os 2 arquivos de integração que cobrem a action/schema desta
  tela, inalterados: `meu-perfil-publico.test.ts`,
  `perfil-publico-contatos.test.ts`).
- E2E (Playwright, build de produção):
  - `tests/e2e/meu-perfil-publico.spec.ts` — **20/20 passando**. 7
    testes precisaram de atualização (justificativa abaixo), os outros
    13 passaram sem nenhuma mudança.
  - `tests/e2e/usuarios.spec.ts` (34 testes) e
    `tests/e2e/perfil-corretor.spec.ts` (26 testes) — **todos passando,
    sem nenhuma alteração** — confirma que a gestão de usuários e a
    ficha pública do corretor continuam intocadas.

### Testes atualizados, com justificativa

Todas as mudanças decorrem diretamente de escolhas estruturais pedidas
pela própria Fase 130 (switch real + 4 cards), nunca de "fazer passar":

1. `salvarPerfil()` (helper compartilhado) e o teste de teclado:
   `[role="checkbox"]` → `[role="switch"]` — o controle agora é um
   switch de verdade (ver seção A).
2. Botão `"Salvar"` → `"Salvar alterações"` (3 ocorrências) — rótulo
   pedido explicitamente pela referência aprovada.
3. `"mesma caixa de conteúdo das outras telas do painel"` (6 variações
   de largura) — o seletor medido mudou de `fieldset` para `main form`
   (não existe mais fieldset único; o `<form>` ocupa a mesma largura
   cheia que ele ocupava).
4. `"os campos continuam todos lá, na mesma ordem"` — mesma troca de
   seletor (`fieldset` → `main form`), ids e ordem dos campos
   inalterados.

## E. Publicação

- **Nenhum commit** foi feito.
- **Nenhum push** foi feito.
- **Nenhum deploy** foi feito.
- **Nenhuma migration** foi feita (não há mudança de schema de banco
  nesta fase).

Aguardando homologação visual do proprietário antes de qualquer
publicação.
