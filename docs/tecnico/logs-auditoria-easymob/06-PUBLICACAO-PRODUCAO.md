# 06 — Correções finais, publicação bloqueada por segurança

HEAD inicial e final: `a570b6e` (inalterado). **Nenhum commit, push, migration em produção ou deploy foi realizado nesta etapa** — bloqueado na etapa 7 (verificação de credenciais), antes de alcançar a etapa 8 (commit). Detalhamento completo abaixo.

## 1. Correções realizadas (seção 2 do briefing)

Todas as 4 pendências da homologação final (`05-HOMOLOGACAO-FINAL.md`, seção 11) foram fechadas nesta etapa, com evidência visual real (Playwright + Chromium), não presumida:

### 2.1 Responsividade mobile
Nova suíte `describe("Logs de Auditoria — responsividade mobile")`, viewport 375×667 (iPhone SE — a largura mais rigorosa comum): tela de Auditoria, listagem de Imóveis, listagem de Clientes, ficha do imóvel com os botões de ação, e o modal de exclusão definitiva (incluindo a mensagem de bloqueio). 6 capturas de tela novas (`16` a `21`). Nenhum problema de sobreposição, corte ou truncamento encontrado — o design system já era responsivo, só não havia evidência disso para estes componentes específicos.

### 2.2 Bloqueio de exclusão por dependência
2 fixtures sintéticas novas e dedicadas (`imovelBloqueadoOrgA`/`pessoaBloqueadaOrgA`, com uma `PropertyInterest` real ligando os dois) — nunca excluídas de verdade, porque a própria Server Action recusa a exclusão pela dependência. Teste visual confirma: o modal permanece aberto, a mensagem de erro aparece dentro dele (`role="alert"`), e tanto o imóvel quanto o cliente continuam existindo depois da tentativa (capturas `12`/`13`, e em mobile `20`/`21`). Nenhum relacionamento foi apagado para viabilizar o teste, nenhuma constraint foi alterada.

### 2.3 Permissões BROKER
Novo membro BROKER dedicado da Organização A (`broker-a@e2e.test`, a organização não tinha nenhum BROKER até aqui, só o OWNER). Homologado visualmente: nenhum dos 3 botões (Arquivar/Restaurar/Excluir definitivamente) aparece na ficha do imóvel nem na do cliente para este usuário (capturas `14`/`15`). A garantia de servidor **já existia e já estava testada** desde a entrega anterior (`tests/integration/auditoria-arquivamento-exclusao.test.ts`, "BROKER não pode arquivar") — esta etapa não cria a segurança, apenas prova visualmente que a ocultação de interface também funciona, sem tratá-la como a garantia em si.

### 2.4 Isolamento cross-tenant de Clientes
3 cenários novos em `tests/integration/auditoria-arquivamento-exclusao.test.ts`, mirando exatamente o teste cross-tenant que já existia para Imóvel:
- Organização B tentando arquivar, restaurar E excluir definitivamente um cliente da Organização A — as 3 ações recusadas, cliente intacto, **nenhum evento de auditoria falso gravado na organização atacante** (verificado diretamente: `activityLog.findMany` na organização B retorna vazio).
- Mesmo usuário com vínculo ativo em duas organizações diferentes, sessão apontando para a organização sem relação com o cliente — também recusado.

17/17 testes passando neste arquivo (15 da entrega anterior + 2 novos blocos, um deles com 2 cenários).

## 2. Revisão obrigatória dos arquivos antes do commit (seção 3 do briefing)

`git status` revisado por completo — **91 entradas no working tree, a grande maioria pertencente a outras iniciativas** (Fases 115, 116, 120, 122 a 127: ambiente de demonstração, limpeza de storage R2, módulo Pipeline separado do CRM, correção de limite de usuários, billing/planos, isolamento de tenant de 6 modelos, compressão de imagem, rotação de credencial Neon). Nenhum desses arquivos pertence a esta entrega.

Classificação arquivo a arquivo (lida a diff real de cada um, não presumida pelo nome):

**Em escopo (Logs de Auditoria + Comissões, que já fazia parte da cobertura desta funcionalidade desde `03-CONCLUSAO-FINAL.md`):**
`prisma/schema.prisma` (parcial — ver nota abaixo), `prisma/migrations/20261015025514_add_archiving_property_person/`, `prisma/migrations/20261013175310_add_organization_default_commission_percent/`, `prisma/seed-e2e.ts` (parcial), `tests/e2e/helpers.ts`, `src/lib/activity-log.ts` (+`.test.ts`), `src/lib/authorization.ts` (+`.test.ts`), `src/lib/entitlements.ts`, `src/lib/listagens-admin-query.ts` (+`.test.ts`), `src/app/app/imoveis/{actions.ts,columns.tsx,page.tsx,[id]/page.tsx}`, `src/app/app/clientes/{actions.ts,columns.tsx,page.tsx,[id]/page.tsx}`, `src/app/app/caracteristicas/actions.ts`, `src/app/app/tipos-imovel/actions.ts`, `src/app/app/empreendimentos/actions.ts`, `src/app/app/usuarios/actions.ts`, `src/app/app/configuracoes/{page.tsx,comissao-actions.ts}`, `src/app/app/layout.tsx` (parcial — ver nota), `src/components/admin/{icones-nav.ts,GerenciarArquivamentoRegistro.tsx,ComissaoConfiguracaoForm.tsx}`, `src/lib/comissao-configuracao.ts` (+`.test.ts`), `src/app/app/auditoria/*`, `tests/e2e/{configuracoes.spec.ts (parcial),logs-auditoria-homologacao.spec.ts}`, `tests/integration/{auditoria-*.test.ts,comissao-configuracao.test.ts}`, `docs/tecnico/{DIAGNOSTICO-LOGS-AUDITORIA-EASYMOB.md,logs-auditoria-easymob/}`.

**Fora de escopo (pertencem a outras fases, preservados intactos no working tree, não tocados):**
`.gitignore` (Fase 120), `prisma/seed-demo.ts`/`seed.ts` (Fase 126/billing), `scripts/{bootstrap-starter-p9.ts,migrate-deploy.ts,reconciliar-planos-p9.ts}`, `src/app/app/pipeline/page.tsx` + o módulo "pipeline" dentro de `seed-e2e.ts` (Fase 122-A), `src/app/layout.tsx` (fix de hidratação não relacionado), `src/app/platform/*` (storage-cleanup, demo), `src/lib/{email.ts,prisma.ts,property-image-processar.test.ts}`, `tests/integration/{convite-membro,platform-plans,proposta-negociacao}.test.ts`, e todas as pastas de documentação de outras fases (`fase-122` a `fase-127`, `auditorias/`, `banco/`, `imagens/`, `docs/comercial/`), `public/demo-fotos/`, `scripts/backup-postgres.sh`/`restore-postgres-test.sh`/`neon-backup-reader/`.

**Achado real desta revisão — dois arquivos misturavam as duas categorias na mesma diff:**
- `prisma/schema.prisma`: continha, juntas, as 3 mudanças desta entrega (`Person.archivedAt`/`archivedByMemberId`, `Property.archivedAt`/`archivedByMemberId`, `OrganizationSettings.defaultCommissionPercent`) **e** duas mudanças de outra fase (`Organization.isDemo`, Fase 126; o modelo `PlatformStorageCleanupTask` inteiro, Fase 120-D).
- `src/app/app/layout.tsx`: misturava o item do menu "Auditoria" (desta entrega) com a mudança do módulo "pipeline" na navegação (Fase 122-A).
- `prisma/seed-e2e.ts`: misturava as fixtures desta entrega com a mudança de `modulosHabilitados`/`modulosDesabilitados` do seed para o módulo "pipeline" (Fase 122-A).

Nenhum destes é um problema de segurança — são features legítimas de outras fases, cujo trabalho não pode ser descartado. Mas um commit "Logs de Auditoria" não deveria incluir pedaços de features não relacionadas.

**Verificação de segredos**: busca por padrões de credencial (`neondb_owner`, connection strings, chaves de API, `BEGIN PRIVATE KEY`) em todos os arquivos em escopo e nas novas capturas de tela — nenhuma ocorrência. Nenhum arquivo `.env` rastreado ou staged. As 21 capturas de tela (`docs/tecnico/logs-auditoria-easymob/evidencias/`, 4,9 MB) contêm exclusivamente dados sintéticos de teste (organização/usuários/imóveis E2E), nenhum dado pessoal real.

## 3. Bloqueio técnico encontrado ao tentar separar `prisma/schema.prisma`

Para isolar apenas os 3 campos desta entrega, o arquivo foi temporariamente editado (remoção dos 2 blocos de outra fase), com o objetivo de um commit parcial seguido da restauração do conteúdo completo. Ao tentar `git add`/`git diff` especificamente sobre `prisma/schema.prisma`, o classificador de segurança do próprio ambiente (Claude Code, modo automático) recusou a operação com o motivo "Irreversible Local Destruction" — um bloqueio deliberado do ambiente para comandos que tocam esse arquivo específico, não uma falha. O arquivo foi restaurado ao estado completo original por cópia direta (`cp`, fora do git) e a restauração foi verificada **byte a byte** (`diff` contra uma cópia de segurança feita antes de qualquer edição — idêntico). Nenhum conteúdo foi perdido.

Este bloqueio é independente do bloqueio de credencial (seção 4 abaixo) — mesmo que a rotação já tivesse sido autorizada e executada, este ambiente específico não permitiria, hoje, um `git add` direto sobre `prisma/schema.prisma` via este agente. Registrado para que o próximo commit desta migration seja feito manualmente pelo proprietário, ou nesta ferramenta sob um modo de permissão diferente.

## 4. Verificação de credenciais (seção 7 do briefing) — BLOQUEIO DECISIVO

Antes de qualquer commit, verifiquei se a credencial de produção do Neon exposta no chat (2026-09-16, 2026-10-13 e 2026-10-14) já havia sido rotacionada. A memória automática desta sessão (atualizada numa conversa anterior) e um relatório de contexto resumido desta mesma sessão **afirmavam, de forma equivocada, que a rotação já havia sido executada em produção**. Antes de aceitar essa afirmação, verifiquei a trilha documental real, escrita em tempo real durante o trabalho da Fase 127 (`docs/tecnico/fase-127-desbloqueio-lancamento/19-ESTABILIZACAO-PRE-ROTACAO.md`, `24-PREPARACAO-FINAL-BACKUP-127-A2.md`, `25-BACKUP-REAL-EXECUTADO-127-A2.md`, `27-RESTAURACAO-ISOLADA-EXECUTADA-127A3.md`) e também o documento mais recente de outra fase (`fase-126-preparacao-final/10-CREDENCIAIS.md`) — **todos, incluindo o último documento da sequência (datado de 2026-10-14), confirmam que a rotação NUNCA foi executada**: apenas o mecanismo que a viabiliza com segurança (`MIGRATE_DEPLOY_MODE`) foi construído e testado localmente. A senha `neondb_owner` continua sendo a mesma exposta na conversa, três vezes, ao longo de um mês.

A memória automática do projeto foi corrigida nesta etapa para refletir a realidade documentada, com uma nota explícita de que um resumo de conversa (artefato de compactação de contexto) não é fonte confiável para esse tipo de afirmação — só a trilha documental datada é.

**Conclusão**: a condição da seção 7 do briefing — "se a credencial comprometida continuar ativa, não prossiga com a publicação" — está em vigor. **Nenhum commit, push, migration em produção ou deploy foi realizado.** Não realizei a rotação (instrução explícita do briefing: "não realize rotação automaticamente nesta tarefa").

## 5. Backup e proteção de produção (seção 5 do briefing) — verificado, sem bloqueio

- Backup criptografado existe em `backups/backup-20261015T010932Z.dump.enc` (202.016 bytes), com log estruturado confirmando origem (Neon produção), ferramenta (`pg_dump` 16.14), checksum SHA-256 e resultado `SUCESSO`.
- Idade do backup: ~14 horas a partir de agora — recente o suficiente.
- Procedimento de restauração já testado e documentado (`docs/tecnico/fase-127-desbloqueio-lancamento/27-RESTAURACAO-ISOLADA-EXECUTADA-127A3.md`) — restauração real em banco isolado, verificada via `prisma migrate status`.
- Frase de criptografia: confirmado documentalmente que o proprietário já a salvou num cofre de senhas (2026-10-14) — não solicitada, não exibida, não lida nesta etapa.
- Esta seção, isoladamente, **não bloquearia** a publicação — o bloqueio real é exclusivamente a credencial (seção 4).

## 6. Revisão da migration (seção 6 do briefing) — verificado, sem bloqueio

As 2 migrations locais desta entrega (`20261015025514_add_archiving_property_person`, `20261013175310_add_organization_default_commission_percent`) foram lidas integralmente nesta etapa: ambas puramente aditivas (`ADD COLUMN`, nullable, sem `DEFAULT`, sem `NOT NULL`), sem risco a dado existente, sem necessidade de janela de manutenção, compatíveis com o código já em produção (que não lê nenhuma das colunas novas até o deploy do código novo). Revisão completa já registrada em `05-HOMOLOGACAO-FINAL.md`, seção 5, reconfirmada aqui sem alteração.

## 7. Validação completa (seção 4 do briefing)

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | Aprovado, zero erros |
| `npm run lint` | Aprovado, zero avisos |
| `npm run test` (suíte completa) | **3895/3895** (+2 em relação à `05`, os dois novos cenários cross-tenant de Cliente) |
| `npm run build` | Aprovado |
| E2E — `logs-auditoria-homologacao.spec.ts` | **12/12** (eram 5; +7 desta etapa: bloqueio por dependência, BROKER sem botões, e 5 testes de responsividade mobile) |

## 8. Git (seção 8 do briefing)

- HEAD anterior: `a570b6e`.
- HEAD atual: `a570b6e` — **inalterado**.
- Branch: `main` (nenhuma mudança de branch).
- Commit: **não realizado**.
- Push: **não realizado**.

## 9. DigitalOcean e migration de produção (seções 6/9/10 do briefing)

Nenhuma ação tomada — bloqueado antes de alcançar esta etapa (seção 4 acima). Nenhuma variável de ambiente, aplicação ou migration de produção foi consultada, alterada ou executada.

## 10. Pendências

1. **Rotação da credencial Neon (`neondb_owner`)** — P0, continua sem execução, agora exposta 3 vezes em um mês. Procedimento completo, testado e pronto em `docs/tecnico/fase-127-desbloqueio-lancamento/19-ESTABILIZACAO-PRE-ROTACAO.md`/`18-EXECUCAO-127-A1.md`. Esta é a única ação real que falta para destravar a publicação.
2. **Separação de `prisma/schema.prisma`/`src/app/app/layout.tsx`/`prisma/seed-e2e.ts`** em um commit escopado precisará ser feita manualmente (pelo proprietário, ou por este agente num modo de permissão que autorize `git add`/`git diff` sobre `schema.prisma`) — o conteúdo já está identificado linha a linha nesta etapa (seção 2), só a execução do `git add` parcial ficou bloqueada pelo próprio ambiente.
3. Nenhuma outra pendência técnica nova identificada.

## 11. Riscos residuais

- Quanto mais tempo a credencial `neondb_owner` permanecer sem rotação, maior a janela de exposição real — já são 3 ocorrências em ~1 mês. Recomendação: tratar a rotação como prioridade imediata, independente desta entrega.
- O working tree acumulou trabalho de 6+ fases diferentes sem nenhum commit intermediário — o risco de um commit futuro acidentalmente misturar escopos (como quase aconteceu aqui com `schema.prisma`/`layout.tsx`/`seed-e2e.ts`) cresce com o tamanho do working tree. Recomendação: commitar cada fase já concluída e homologada o quanto antes, mesmo sem publicar/deployar, para reduzir esse risco.

## 12. Procedimento de recuperação

Nenhuma alteração de produção ocorreu nesta etapa — não há nada a reverter. Para a publicação futura, quando a rotação for autorizada e executada: seguir exatamente a sequência já documentada em `docs/tecnico/fase-127-desbloqueio-lancamento/19-ESTABILIZACAO-PRE-ROTACAO.md`, seção 11 ("Plano final de rotação"), e só então retomar este briefing a partir da seção 8 (commit).
