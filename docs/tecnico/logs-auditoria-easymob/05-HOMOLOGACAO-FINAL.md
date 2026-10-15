# 05 — Homologação final: Logs de Auditoria, Arquivamento e Exclusão Definitiva

HEAD inicial e final: `a570b6e` (inalterado). Nenhum commit, push, deploy, migration em produção, alteração em Neon/DigitalOcean de produção, rotação de credencial, exclusão de dado real ou de arquivo real no R2 ocorreu nesta etapa.

## 1. Objetivo desta etapa

Validar de forma real — não presumida — tudo que as entregas anteriores (`00` a `04`) descreveram, especificamente distinguindo **smoke test HTTP** (o que havia sido feito até aqui) de **homologação visual real**, agora possível porque este ambiente já tem Playwright + Chromium instalados (confirmado nesta etapa, nunca antes usado neste projeto). O objetivo não foi redesenhar nada já pronto, e sim: executar os fluxos num navegador de verdade, reconfirmar a atomicidade e a migration lendo o código uma segunda vez (não citando a conclusão anterior sem reverificar), e produzir um parecer de prontidão com evidência anexada.

## 2. O que foi efetivamente executado

- Escrita de `tests/e2e/logs-auditoria-homologacao.spec.ts` (5 testes, execução serial), cobrindo: arquivar/listar-sem/listar-com/restaurar de Imóvel; o mesmo para Cliente; exclusão definitiva de Imóvel com modal, confirmação digitada e botão desabilitado até o texto bater exatamente; o mesmo para Cliente; e a tela `/app/auditoria` com filtro por módulo.
- 4 fixtures novas e dedicadas (`imovelArquivamentoOrgA`, `pessoaArquivamentoOrgA`, `imovelExclusaoOrgA`, `pessoaExclusaoOrgA`), seguindo a convenção já estabelecida no projeto de nunca compartilhar um registro mutável entre specs — criadas em `prisma/seed-e2e.ts`, 100% sintéticas e descartáveis, no banco de teste isolado (`imoveis_test`).
- 3 bugs reais encontrados e corrigidos durante a própria execução dos testes (seção 4) — nenhum deles presumido, todos reproduzidos e confirmados antes de qualquer correção.
- Suíte final: **5/5 testes passando**, 11 capturas de tela reais salvas em `docs/tecnico/logs-auditoria-easymob/evidencias/`.
- Releitura linha a linha das 6 Server Actions de arquivamento/restauração/exclusão (não apenas citação do relatório anterior).
- Releitura da migration `20261015025514_add_archiving_property_person` contra o SQL real do arquivo, não contra a memória do relatório anterior.
- Gate completo reexecutado: `tsc`, `lint`, suíte de testes completa, `build`.

## 3. Bugs reais encontrados e corrigidos nesta etapa

1. **Falso 404 por build desatualizado.** O primeiro teste falhava com uma página 404 genuína ao abrir a ficha do imóvel novo. Investigação descartou, nessa ordem, com evidência: `organizationId` incorreto (não era — conferido via SQL direto), o seed apagando o registro (não era — reconfirmado via SQL logo após a falha), uma condição de corrida (não era — a mesma URL, chamada 3 vezes seguidas na mesma sessão, deu 404 nas 3). A causa real: os testes haviam sido disparados via `npx playwright test` direto, pulando o hook `pretest:e2e` (`scripts/e2e-preparar.ts`) que reconstrói o build de produção antes da suíte — o servidor estava servindo um build anterior à própria existência do código de arquivamento. Confirmado de forma definitiva: a string de um `console.error` de depuração, adicionada e recompilada, só apareceu no artefato `.next` depois de rodar `npm run test:e2e` (que aciona o hook), nunca com `npx playwright test` isolado.
2. **`IDS_E2E` duplicado em dois arquivos, só um foi atualizado.** O registro de ids fixos existe, por razões históricas, tanto em `prisma/seed-e2e.ts` quanto em `tests/e2e/helpers.ts` — são dois objetos independentes, não um compartilhado. As 4 novas fixtures haviam sido adicionadas só no primeiro (usado pelo seed), nunca no segundo (usado pelos specs). Resultado: o spec navegava para `/app/imoveis/undefined`, e o 404 acima, embora com causa raiz diferente, era também real por esse motivo depois de corrigir o build. Corrigido adicionando as mesmas 4 chaves a `tests/e2e/helpers.ts`, com o mesmo comentário de contexto já usado no outro arquivo.
3. **Filtro "Módulo" na tela de auditoria: teste validava texto solto, não a filtragem real.** A primeira versão do teste 5 clicava no filtro e checava se os textos `archived`/`restored`/`deleted_permanently` apareciam em algum lugar da página — o que passa mesmo sem filtragem nenhuma, porque a tabela (56 mil registros no total) contém esses textos de qualquer forma. A captura de tela revelou visualmente o problema: o menu suspenso continuava aberto por cima da tabela, e a tabela ainda misturava `Session`, `Person` e `Property`. Corrigido para: fechar o menu antes de prosseguir (`expect(listbox).not.toBeVisible()`), confirmar a URL (`entity=Property`), confirmar que `Session` desaparece da tabela, e confirmar que existe ao menos uma célula `Property` — só então a captura final é tirada. Reexecutado: a tabela mostra agora exclusivamente eventos `Property`, dropdown fechado.

Nenhum destes era um defeito na aplicação em si (os 3 foram defeitos nos próprios testes/scripts de homologação) — mas sem corrigi-los a homologação visual real teria ficado bloqueada, e um dos 3 (a ambiguidade `IDS_E2E`) era um risco real de regressão silenciosa para qualquer spec futuro que reusasse esse padrão sem saber da duplicidade.

Durante a correção dos testes, também foi corrigido o caminho de saída das capturas de tela: `page.screenshot({ path })` resolve o caminho contra o diretório de trabalho do processo (raiz do repositório), não contra a pasta do arquivo de spec — a primeira execução, com um caminho relativo `../../docs/...`, gravou as 11 imagens fora do repositório (`/Users/alexboccia/docs/...`). As imagens foram movidas para o lugar correto e o caminho no spec foi corrigido para ser relativo à raiz do repo.

## 4. Atomicidade das 6 Server Actions — reconfirmada por leitura, não por citação

Leitura linha a linha de `arquivarImovel`, `restaurarImovel`, `excluirImovelDefinitivamente` (`src/app/app/imoveis/actions.ts`) e `arquivarCliente`, `restaurarCliente`, `excluirClienteDefinitivamente` (`src/app/app/clientes/actions.ts`), nesta etapa, do zero:

- Todas as 6 verificam o papel (`temPapel(..., PAPEIS_ARQUIVAMENTO)` ou `PAPEIS_EXCLUSAO_DEFINITIVA`) **antes** de qualquer leitura ou mutação — a UI escondendo o botão é higiene de interface, não a garantia; a garantia real está aqui, re-verificada.
- Todas resolvem `organizationId` via `requireOrganizationId()` e rodam dentro de `withOrganization(organizationId, ...)` — nenhuma consulta depende só do id vindo da URL.
- Nas 6, a mutação principal (`updateMany`/`delete`) e o `logActivity(..., tx)` correspondente estão dentro do **mesmo** `prisma.$transaction(async (tx) => {...})`, com `tx` passado explicitamente ao `logActivity` — não há nenhum caminho onde um é confirmado sem o outro.
- As duas exclusões definitivas capturam especificamente o código de erro `P2003` (violação de FK) e traduzem para uma mensagem amigável, sem nunca silenciar outros erros (`throw erro` no `catch` para qualquer código diferente).
- `excluirClienteDefinitivamente` conta manualmente `propertyInterests` **antes** da exclusão e bloqueia se houver qualquer um — proteção deliberada contra o `CASCADE` real de `property_interests.personId`, que o banco não bloqueia sozinho (diferente de `Property`, onde o próprio banco barra via `RESTRICT`).
- Em `excluirImovelDefinitivamente`, a limpeza de objetos no R2 só acontece **depois** da transação confirmada (`await removerObjetosR2(...)` fora do `$transaction`), nunca antes — mesma ordem já usada em `atualizarImovel`.

Conclusão desta releitura: nenhuma divergência em relação ao que o relatório `04` já afirmava. Reconfirmado, não apenas repetido.

## 5. Migration — revisão específica desta etapa

`prisma/migrations/20261015025514_add_archiving_property_person/migration.sql` lido integralmente nesta etapa:

```sql
ALTER TABLE "people" ADD COLUMN "archivedAt" TIMESTAMP(3), ADD COLUMN "archivedByMemberId" TEXT;
ALTER TABLE "properties" ADD COLUMN "archivedAt" TIMESTAMP(3), ADD COLUMN "archivedByMemberId" TEXT;
ALTER TABLE "people" ADD CONSTRAINT "people_archivedByMemberId_fkey" FOREIGN KEY ("archivedByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "properties" ADD CONSTRAINT "properties_archivedByMemberId_fkey" FOREIGN KEY ("archivedByMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Checklist pedido nesta etapa:

| Item | Avaliação |
|---|---|
| Compatibilidade com dados existentes | Colunas `NULL`-ável, sem `DEFAULT`, sem `NOT NULL` — todo registro existente nasce com `archivedAt = NULL` (não arquivado). Zero risco de falha em tabela populada. |
| Impacto em registros existentes | Nenhum — nenhuma linha é tocada pela migration em si (só `ADD COLUMN`). |
| Índices/constraints | 2 FKs `SET NULL` (coerente com toda FK de autoria/ator do schema — nunca `CASCADE`/`RESTRICT` para esse papel). Nenhum índice em `archivedAt` — decisão consciente já registrada em `04` (volume atual não justifica). |
| Risco de falha em banco populado | Nenhum — operação aditiva pura, sem *backfill*, sem *lock* de longa duração esperado (poucas dezenas de linhas em ambos os bancos de teste/desenvolvimento; em produção o volume é da mesma ordem de grandeza, conforme já registrado nos relatórios da Fase 127). |
| Compatibilidade com o deploy atual (código já em produção) | Total — o código hoje em produção nunca lê `archivedAt`/`archivedByMemberId`; a migration pode ser aplicada antes do deploy do código novo sem quebrar nada. |
| Risco no Job de pré-deploy (`imob2`) | Nenhum identificado — mesmo fluxo já usado em todas as migrations aditivas anteriores desta aplicação, sem necessidade de `MIGRATE_DEPLOY_MODE=skip-intentional` (esse mecanismo é para desacoplar rotação de credencial, não para esta migration). |
| Dependência de coluna no código | As duas colunas já são lidas/escritas pelas 6 Server Actions e pelas duas listagens (`construirWhereImoveis`/`Clientes`) — aplicar a migration SEM publicar o código novo é seguro (coluna existe, nada a lê); publicar o código SEM a migration quebraria imediatamente (coluna não existe) — portanto a ordem correta e obrigatória é **migration primeiro, deploy do código depois**, nunca o inverso. |

Nenhuma mudança na migration foi necessária nesta etapa — a revisão anterior (`04`, seção 9) se confirma integralmente.

## 6. A interface está pronta?

Sim, para os fluxos cobertos pela suíte de homologação visual real (seção 2): botão "Arquivar" (ação secundária) e, uma vez arquivado, badge "Arquivado" + botão "Restaurar", visíveis e funcionais na ficha de Imóvel e na ficha de Cliente (capturas `01`–`07`); o botão vermelho "Excluir definitivamente" abre um modal com aviso de irreversibilidade, campo de confirmação digitada e botão que permanece desabilitado até o texto bater exatamente (capturas `08`–`09`), e a listagem (`/app/imoveis`, `/app/clientes`) esconde arquivados por padrão com um toggle "Ver arquivados" que os traz de volta com badge (capturas `03`–`04`). A tela `/app/auditoria` exibe os eventos corretamente, com filtro por módulo funcional (capturas `10`–`11`).

**O que não foi validado nesta etapa, com honestidade**: comportamento em mobile/responsivo (nenhum teste rodou em viewport reduzido); o cenário de bloqueio por dependência vinculada (negociação aberta) não foi exercitado visualmente nesta suíte — está coberto apenas por teste automatizado de integração (`tests/integration/auditoria-arquivamento-exclusao.test.ts`, "negociação vinculada bloqueia a exclusão definitiva"), não por uma captura de tela do modal de erro; o comportamento do BROKER (sem nenhum dos 3 botões) também não foi verificado visualmente nesta suíte, só por teste automatizado de servidor (mesma referência).

## 7. Os fluxos estão funcionando?

**Imóveis**: arquivar → some da listagem padrão → aparece com "Ver arquivados" e badge → restaurar → volta ao padrão. Confirmado em navegador real, 5 asserções por etapa, screenshot por etapa.

**Clientes**: mesmo fluxo, mesmo resultado, confirmado em navegador real.

**Exclusão definitiva — Imóvel**: modal abre, aviso de irreversibilidade visível, botão desabilitado com texto errado, habilita só com o título exato, a confirmação executa a exclusão e — comportamento real observado, não assumido — **não há redirecionamento client-side**; a Server Action revalida a própria rota (`revalidatePath`) e, como o registro já não existe, o re-render em cima da mesma URL cai no `notFound()` da própria página (404 "in place"). Isto foi uma descoberta real desta etapa (o teste original presumia um redirecionamento e falhou corretamente até ser corrigido) — comportamento correto e seguro, só documentado de forma imprecisa no relatório anterior.

**Exclusão definitiva — Cliente**: mesmo comportamento, confirmado.

## 8. A auditoria está íntegra?

Confirmado visualmente (captura `11`, filtro por `Property`, dropdown fechado, URL com `entity=Property`): todos os eventos `archived`/`restored`/`deleted_permanently` aparecem corretamente associados ao usuário (`Organização E2E A`), com timestamp, módulo, ação e o campo `Detalhes` mostrando o payload mínimo esperado (`title: Casa E2E Exclusão Definitiva` nas exclusões). Nenhum evento de outro módulo (`Session`, `Person`, `User`) vazou para dentro do filtro — verificado explicitamente via `expect(tabela.getByText("Session")).toHaveCount(0)`, não apenas pela presença do texto esperado.

Atomicidade: reconfirmada por leitura de código nesta etapa (seção 4) e, adicionalmente, já comprovada por teste de falha real de transação em etapa anterior (`tests/integration/auditoria-exclusoes-catalogo.test.ts`, describe "atomicidade" — uma falha de FK real dentro do `$transaction` reverte também a mutação de negócio, não só o log).

Isolamento multi-tenant: reconfirmado por teste automatizado existente (`cross-tenant: não é possível arquivar imóvel de outra organização`, em `auditoria-arquivamento-exclusao.test.ts`). **Nota de honestidade**: o teste cross-tenant explícito existe para `Property`; para `Person` não há um teste cross-tenant dedicado equivalente — o mecanismo de proteção é idêntico (mesmo padrão `where: { id, organizationId }` dentro do mesmo `withOrganization` fail-closed, usado por toda a aplicação, inclusive pelo caminho já testado de `Property`), mas isso é inferência por simetria de código, não uma segunda prova direta. Classificado como pendência menor na seção 11.

## 9. A migration está pronta?

Sim, tecnicamente pronta para aplicação em produção (seção 5) — aditiva, sem risco a dado existente, ordem de deploy exigida é migration-antes-do-código (documentada). **Não aplicada nesta etapa, por instrução explícita.**

## 10. Qualidade (gates automatizados)

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | Aprovado, zero erros |
| `npm run lint` | Aprovado, zero avisos |
| `npm run test` (suíte completa) | **3893/3893**, zero regressões (mesma contagem da entrega `04` — nenhum teste novo de unidade/integração foi necessário nesta etapa, o trabalho foi inteiramente E2E) |
| `npm run build` | Aprovado — todas as rotas, incluindo `/app/imoveis/[id]`, `/app/clientes/[id]`, `/app/auditoria`, presentes e corretamente marcadas como dinâmicas (`ƒ`) |
| `tests/e2e/logs-auditoria-homologacao.spec.ts` (novo, homologação visual real) | **5/5 passando**, 11 capturas de tela reais em `docs/tecnico/logs-auditoria-easymob/evidencias/` (2,9 MB) |

## 11. Riscos residuais e pendências explícitas

1. Responsividade/mobile dos modais e botões não testada visualmente (ver seção 6).
2. Bloqueio por dependência vinculada e ocultação de botões para BROKER: comprovados por teste automatizado de servidor, não por captura de tela (ver seção 6).
3. Teste cross-tenant automatizado existe para `Property`, não há um equivalente dedicado para `Person` (ver seção 8) — risco baixo (mesmo mecanismo comprovado), mas não é uma segunda prova direta.
4. Pendência de rotação de credencial de produção do Neon, mencionada no briefing desta etapa: **não aplicável a esta entrega** — a rotação já foi executada, com autorização explícita, passo a passo, em etapa anterior e totalmente independente (Fase 127, documentada em `docs/tecnico/fase-127-desbloqueio-lancamento/`). Nenhuma ação de credencial foi tomada ou revisitada nesta etapa, conforme instruído.
5. Nenhum outro risco técnico novo identificado nesta revisão.

## 12. Evidências

- 11 capturas de tela reais, em `docs/tecnico/logs-auditoria-easymob/evidencias/` (`01` a `11`), geradas por uma execução real e integral da suíte `logs-auditoria-homologacao.spec.ts` contra um build de produção local (`next start`), banco de teste isolado e sintético, navegador Chromium real.
- Saída completa da execução final: `5 passed (16.4s)`.
- Leitura de código citada linha a linha nas seções 4 e 5, não apenas referenciada.

## 13. Checklist de homologação (status final)

- [x] Abrir `/app/imoveis/[id]` como OWNER e confirmar que o botão "Arquivar" aparece e funciona — confirmado em navegador real.
- [x] Confirmar que o imóvel arquivado some de `/app/imoveis` por padrão e aparece com "Ver arquivados" — confirmado.
- [x] Confirmar que "Restaurar" devolve o imóvel à listagem padrão — confirmado.
- [ ] Tentar excluir definitivamente um imóvel com negociação vinculada e confirmar a mensagem de bloqueio no modal — coberto só por teste automatizado, não visualmente nesta etapa.
- [x] Repetir os itens acima para Clientes — confirmado (exceto o item de bloqueio, mesma ressalva).
- [x] Conferir `/app/auditoria` depois de cada operação — confirmado, com filtro por módulo validado de forma rigorosa.
- [ ] Testar em mobile — não realizado nesta etapa.
- [ ] Confirmar que um BROKER não vê nenhum dos três botões — coberto só por teste automatizado (a lógica de ocultação é a mesma prop computada no servidor já lida no código, seção 6 do relatório `04`), não visualmente nesta etapa.

## 14. Parecer final

**PRONTA TECNICAMENTE, MAS PENDENTE DE HOMOLOGAÇÃO MANUAL**

Justificativa: os fluxos centrais (arquivar, restaurar, excluir definitivamente, visualização na tela de auditoria) foram validados com evidência visual real desta vez — não um smoke test HTTP — para os dois módulos (Imóveis e Clientes), com 3 bugs reais nos próprios testes de homologação encontrados e corrigidos no processo, atomicidade e migration reconfirmadas por leitura direta de código nesta etapa, e todos os gates automatizados (`tsc`, `lint`, suíte completa, `build`) aprovados. Isto é suficiente para considerar a implementação **tecnicamente correta e pronta para deploy**, na ordem documentada (migration antes do código).

Não é, ainda, uma homologação manual completa: os itens não marcados na seção 13 (responsividade mobile, o modal de bloqueio por dependência, e a ocultação de botões para BROKER) continuam sem confirmação visual direta — estão cobertos por teste automatizado de servidor, o que garante a **segurança** desses caminhos, mas não substitui alguém olhando a tela. Por isso o parecer não é "pronta para solicitar aprovação de publicação" sem ressalva: falta esse passo final, de responsabilidade de quem tiver acesso visual de produção ou disposição para rodar manualmente os 3 itens pendentes antes de autorizar o deploy.
