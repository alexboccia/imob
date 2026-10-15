# 04 — Interfaces de arquivamento/exclusão e homologação local

HEAD inicial e final: `a570b6e` (inalterado). Nenhum commit, push, deploy, ou alteração em produção.

## 1. Resumo da entrega

As interfaces de arquivamento, restauração e exclusão definitiva para Imóveis e Clientes foram construídas, integradas ao backend já validado, e reaproveitam integralmente o design system existente (`Dialog`, `Button`, `Badge`, `Input` — nenhum componente visual novo do zero). Um componente único (`GerenciarArquivamentoRegistro`) serve as duas entidades, evitando duplicar a parte mais sensível (confirmação digitada de exclusão).

## 2. Arquivamento de Imóveis

**Onde**: página de edição do imóvel (`/app/imoveis/[id]`), no cabeçalho, ao lado de "Gerar anúncio".

- Botão "Arquivar" (reversível, ação secundária, ícone `Archive`) — clique único, sem modal, mesmo padrão de "Excluir" em Empreendimentos. Mensagem abaixo do botão explica que é reversível.
- Quando já arquivado: badge "Arquivado" + botão "Restaurar" (ícone `ArchiveRestore`) no lugar de "Arquivar".
- Listagem (`/app/imoveis`): imóveis arquivados somem da lista padrão. Botão "Ver arquivados"/"Ocultar arquivados" (link puro, preserva busca/filtros/ordenação atuais) alterna a visualização. Quando visíveis, um badge "Arquivado" aparece ao lado do badge de status — nunca confundidos (status continua mostrando o estágio comercial normal).

## 3. Arquivamento de Clientes

Mesmo componente, mesma experiência, na ficha do cliente (`/app/clientes/[id]`) e na listagem (`/app/clientes`) — botão "Ver arquivados" preservando os filtros atuais, badge "Arquivado" ao lado do nome na lista.

## 4. Exclusão definitiva de Imóveis

**Fluxo**: botão "Excluir definitivamente" (variante `ghost`, texto e ícone `AlertTriangle` em vermelho — visualmente distinto de "Arquivar") abre um `Dialog`:
- Título em vermelho, com aviso explícito de que a ação é "permanente e irreversível" e que, diferente de arquivar, não há como restaurar pela interface.
- Aviso de que negociações/interesses vinculados bloqueiam a exclusão.
- Campo de confirmação: o usuário precisa digitar o **título exato** do imóvel.
- Botão "Excluir definitivamente" (`variant="destructive"`) **desabilitado até o texto bater exatamente** — validado no cliente (UX) e **revalidado no servidor** (segurança real, a Server Action já fazia isso desde a entrega anterior).
- Se a exclusão for recusada (dependência ou confirmação errada), a mensagem de erro aparece dentro do próprio modal, sem fechá-lo.

## 5. Exclusão definitiva de Clientes

Mesmo fluxo e mesmo componente — a mensagem de dependência específica ("negociações vinculadas") vem diretamente da Server Action já existente (que bloqueia manualmente o CASCADE de `property_interests`).

## 6. Permissões e segurança

- Os dois botões de arquivamento só aparecem para quem tem `PAPEIS_ARQUIVAMENTO` (OWNER/ADMIN/MANAGER); o de exclusão definitiva, só para `PAPEIS_EXCLUSAO_DEFINITIVA` (OWNER/ADMIN). Mesma doutrina já documentada no projeto: **esconder o botão é higiene de interface, a garantia real está nas Server Actions**, que revalidam o papel de forma independente — confirmado, nenhuma delas foi alterada para acomodar a UI.
- Nenhum endpoint novo foi criado — tudo via Server Actions já existentes e já testadas (15 testes de integração da entrega anterior continuam cobrindo o comportamento real).
- Isolamento multi-tenant: inalterado, nenhuma query nova na interface além de passar `organizationId` implícito via as mesmas Server Actions.

## 7. Auditoria das operações

Nenhuma mudança necessária — as Server Actions já gravavam `archived`/`restored`/`deleted_permanently` desde a entrega anterior. A tela `/app/auditoria` já exibe esses eventos corretamente: `entity` (`Property`/`Person`), `action`, `payload` (nome/título preservado nas exclusões definitivas). Reconfirmado manualmente lendo o código de `columns.tsx` de `/app/auditoria` — o resumo de `payload` já trata tanto o formato `{campo}Antes/Depois` quanto pares soltos (`{ name: "..." }`), então os eventos desta entrega aparecem de forma legível sem nenhuma mudança na tela de auditoria.

## 8. Atomicidade — revisão adicional pedida

Confirmado, lendo cada uma das 6 Server Actions novas/alteradas (`arquivarImovel`, `restaurarImovel`, `excluirImovelDefinitivamente`, `arquivarCliente`, `restaurarCliente`, `excluirClienteDefinitivamente`): **todas** envolvem a mutação principal e `logActivity` dentro do mesmo `prisma.$transaction(async (tx) => {...})`, passando `tx` explicitamente. Não há nenhum caminho onde a mutação é confirmada sem o log, ou vice-versa — reconfirmado por leitura linha a linha, não presumido pela existência de `tx` como parâmetro.

## 9. Revisão da migration local

`20261015025514_add_archiving_property_person` — reconfirmada:
- Duas colunas nullable (`archivedAt TIMESTAMP(3)`, `archivedByMemberId TEXT`) em `properties` e `people`, sem `DEFAULT` nem `NOT NULL` — **zero risco para registros existentes**, todos nascem com `archivedAt = NULL` (não arquivados), exatamente o comportamento correto.
- Duas FKs `SET NULL` para `organization_members` — consistente com toda FK de autoria/ator já existente no schema (nunca `CASCADE`/`RESTRICT` para esse tipo de referência).
- Nenhum índice adicionado para `archivedAt` — decisão consciente: o volume real (98 linhas em `activity_logs`, poucas dezenas de imóveis/clientes) não justifica um índice ainda; `construirWhereImoveis`/`Clientes` usa `archivedAt: null` como mais uma condição de igualdade simples no `where`, sobre um volume pequeno. Revisar se o volume crescer.
- **Compatível com o deploy atual**: puramente aditiva, zero risco de quebrar o código já em produção (que nunca lê essas colunas, então nem percebe a mudança até o código novo ser publicado).
- Nenhuma estratégia de rollback especial necessária além do runbook já existente (`docs/operations/rollback-runbook.md`) — reverter é um `DROP COLUMN` simples, sem perda de dado funcional (os dados de arquivamento em si seriam perdidos, mas nenhum outro dado).

## 10. Testes executados

Nenhum teste novo de UI foi escrito nesta entrega (os 15 testes de integração de arquivamento/exclusão, da entrega anterior, já testam o comportamento real por trás dos botões — escrever testes de componente React para os mesmos cenários seria testar a mesma coisa duas vezes, sem ganho real de confiança). O que foi validado nesta entrega, especificamente:

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | Aprovado |
| `npm run lint` | Aprovado |
| `npm run test` (suíte completa) | **3893/3893**, zero regressões |
| `npm run build` | Aprovado — `/app/imoveis`, `/app/clientes`, `/app/auditoria` presentes no manifesto |
| Smoke test via servidor de desenvolvimento real | As 3 rotas redirecionam corretamente (HTTP 307) para usuário não autenticado, **sem erro 500**, sem erro de compilação no log do servidor |

## 11. Evidências

- Build de produção local concluído sem erros, incluindo as páginas alteradas.
- Servidor de desenvolvimento real iniciado e as 3 rotas testadas via `curl` — nenhuma quebrou.
- Leitura linha a linha das 6 Server Actions confirmando atomicidade (seção 8).

## 12. Pendências

1. **Homologação visual completa não realizada** — mesma limitação de todas as entregas anteriores desta demanda: não há ferramenta de navegador neste ambiente. O smoke test via `curl` prova que as páginas renderizam sem erro até o ponto do redirecionamento de autenticação, mas não prova a aparência final, o comportamento do modal, nem a experiência em mobile. **Isto não é alegado como validado.**
2. Nenhuma outra pendência técnica identificada nesta revisão.

## 13. Riscos residuais

- O link "Ver arquivados" usa um parâmetro de URL simples (`?arquivados=1`) — não é persistido entre sessões nem por usuário; comportamento aceitável para uma primeira versão, consistente com os demais filtros da aplicação (também não persistem).
- Nenhuma paginação separada para "arquivados" — eles aparecem misturados com os ativos quando o toggle está ligado, diferenciados só pelo badge. Se o volume de arquivados crescer muito, uma view dedicada seria mais clara — não necessário no volume atual.

## 14. Checklist de homologação

- [ ] Abrir `/app/imoveis/[id]` como OWNER/ADMIN/MANAGER e confirmar que o botão "Arquivar" aparece e funciona.
- [ ] Confirmar que o imóvel arquivado some de `/app/imoveis` por padrão e aparece com "Ver arquivados".
- [ ] Confirmar que "Restaurar" devolve o imóvel à listagem padrão.
- [ ] Tentar excluir definitivamente um imóvel com negociação vinculada — confirmar que a mensagem de bloqueio aparece dentro do modal.
- [ ] Repetir os 4 itens acima para Clientes.
- [ ] Conferir a tela `/app/auditoria` depois de cada operação acima — confirmar que o evento aparece com usuário, data, módulo, ação e detalhe corretos.
- [ ] Testar em mobile (responsividade do modal e dos botões).
- [ ] Confirmar que um BROKER não vê nenhum dos três botões.

## 15. Procedimento recomendado para deploy futuro

1. Revisão de código desta entrega (Server Actions + migration + UI).
2. Homologação visual real (checklist acima), feita por alguém com acesso a navegador.
3. Commit + push, com a migration incluída.
4. Aplicar a migration em produção via o fluxo já existente (Job `imob2`, `MIGRATE_DEPLOY_MODE=apply`).
5. Deploy.

Nada disso foi executado nesta entrega.
