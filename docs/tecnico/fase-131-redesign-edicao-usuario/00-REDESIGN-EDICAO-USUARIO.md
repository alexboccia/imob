# Fase 131 — Redesign de "Editar usuário" (gestão de usuários)

Status: implementado, testado e **publicado** (deploy abaixo). Segunda
aplicação do padrão visual de cards estabelecido nas Fases 129/130, a
pedido explícito do proprietário ("aplicar o mesmo padrão visual... em
todas as páginas administrativas", uma página por vez, com deploy e
aviso para avaliação após cada uma).

## O que mudou

A tela `/app/usuarios/[id]` (edição de um membro pelo administrador)
saiu de um único card estreito (`max-w-lg`, 512px, tudo empilhado sem
nenhuma separação visual por assunto) para **6 cards** full-width, no
mesmo padrão de "Meu perfil público" (Fase 130):

1. **Identificação** — e-mail (somente leitura), nome, foto usada no
   painel.
2. **Contato operacional** — WhatsApp e e-mail operacionais (uso
   interno, nunca publicados).
3. **Perfil público** — switch de visibilidade + bloco informativo.
4. **Foto pública**.
5. **Informações de contato** (públicas) — CRECI, WhatsApp, telefone,
   e-mail.
6. **Apresentação** (bio).
7. **Acesso e permissões** — papel, status (switch "Usuário ativo"),
   nova senha.

Rodapé único, ao final de tudo: link "Ver este perfil no site" + botão
azul "Salvar alterações" — um só fluxo de salvamento, mesma Server
Action (`atualizarUsuario`) de sempre.

## Decisão arquitetural: promoção dos cards de perfil público

Os 4 cards de perfil público construídos na Fase 130
(`CardPerfilPublico`, `CardFotoPublica`, `CardContatosPublicos`,
`CardApresentacao`) foram usados **sem nenhuma duplicação de JSX** —
só promovidos de `src/components/admin/meu-perfil/` para
`src/components/admin/perfil-publico/` (nome genérico, já que agora
servem duas páginas) e `git mv`idos, preservando histórico.

Isso tornou o antigo `PerfilPublicoCorretorFields.tsx` — o fieldset
único que `EditarUsuarioForm` usava antes — órfão (zero consumidores),
e ele foi removido.

`CardApresentacao` ganhou um prop opcional `rodape?: boolean` (padrão
`true`, mantendo "Meu perfil público" idêntico): o link "Ver perfil" +
botão de salvar foram extraídos para um componente próprio,
`RodapeSalvarPerfilPublico`, porque em `EditarUsuarioForm` o formulário
continua depois da Apresentação (Papel, status, senha) — o rodapé
precisa ser o último elemento do `<form>`, não um filho do card de
Apresentação.

## Arquivos novos

- `src/components/admin/perfil-publico/RodapeSalvarPerfilPublico.tsx`
- `src/components/admin/usuarios/CardIdentificacaoUsuario.tsx`
- `src/components/admin/usuarios/CardContatoOperacional.tsx`
- `src/components/admin/usuarios/CardAcessoPermissoes.tsx`

## Arquivos modificados

- `src/components/admin/EditarUsuarioForm.tsx` — reescrito para
  orquestrar os 7 cards dentro do mesmo `<form action={formAction}>`.
- `src/components/admin/perfil-publico/CardApresentacao.tsx` — prop
  `rodape` (ver acima).
- `src/app/app/usuarios/[id]/page.tsx` — removeu o `max-w-lg` do
  conteúdo principal (mantido só no estado de recusa, uma tela de uma
  frase); adicionou cabeçalho com título + subtítulo, no mesmo padrão
  de "Meu perfil público"/"Editar imóvel".
- `src/components/admin/MeuPerfilPublicoForm.tsx` — só os 4 imports
  atualizados para o novo caminho (`perfil-publico/`, não mais
  `meu-perfil/`); nenhuma mudança de comportamento.

## Arquivo removido

- `src/components/admin/PerfilPublicoCorretorFields.tsx` — sem
  nenhum consumidor após a migração de `EditarUsuarioForm`.

## Preservação funcional

Nada mudou na lógica: mesma action (`atualizarUsuario`), mesmos nomes
de campo (`nome`, `whatsapp`, `emailContato`, `papel`, `ativo`,
`novaSenha`, `perfilPublico*`), mesma regra de "editando a si mesmo" —
papel e status viram campos ocultos com um aviso, exatamente como
antes (confirmado visualmente nas capturas desktop e mobile: a conta
`owner-a@e2e.test` editando a si mesma mostra "Proprietário" como
texto, não como seletor). "Usuário ativo" passou de checkbox para
switch (mesmo raciocínio da Fase 130: Base UI Switch submete o mesmo
"on"/nada de um checkbox nativo no FormData — nenhuma mudança na
action).

## Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` nos arquivos tocados — sem erros.
- `npm run build` — build de produção completo, sem erros.
- `npx vitest run` — 208 arquivos, **3895 testes**, todos passando.
- E2E (Playwright, build de produção):
  - `perfil-corretor.spec.ts` — **25/25** (é o arquivo que de fato
    exercita `EditarUsuarioForm` ponta a ponta — publicar/despublicar,
    contatos, responsividade).
  - `meu-perfil-publico.spec.ts` — **20/20** sem nenhuma mudança (prova
    que a promoção dos cards compartilhados não afetou a tela de
    autoatendimento).
  - `usuarios.spec.ts` (listagem) — **10/10** sem mudança.
  - `tenant-isolation.spec.ts` (IDOR cross-tenant nesta mesma rota) —
    **1/1** sem mudança.
- Testes atualizados, com justificativa: `perfil-corretor.spec.ts`,
  helper `definirPerfilPublico` — `[role="checkbox"]` → `[role="switch"]`
  e `"Salvar"` → `"Salvar alterações"` (mesma mudança estrutural já
  justificada na Fase 130, agora refletida no único outro lugar que
  também exercitava esse controle).

## Evidências visuais

`evidencias/`: `usuario-edicao-1440.png`, `-1024.png`, `-768.png`,
`-390.png` (editando a própria conta — ramo "você mesmo", papel como
texto) e `usuario-edicao-outro-1440.png` (editando outro membro — ramo
com Select de papel + switch "Usuário ativo"). Sem overflow de
documento em nenhuma das larguras verificadas.

## Pendências

Nenhuma identificada. Próxima página do plano "todas as páginas
administrativas" a definir após avaliação desta.
