# 05 — Ciclo de vida das imagens no R2 (planejamento)

**Nenhum arquivo foi excluído nesta fase.** Documento de planejamento puro.

## Mapeamento do ciclo completo

1. **Upload** — já existe (`route.ts`), proposta de adicionar compressão (`02-ARQUITETURA-COMPRESSAO.md`).
2. **Persistência da referência** — já existe (Server Action do imóvel), proposta de adicionar validação de origem (`04-SEGURANCA-MULTITENANT.md` §4.1).
3. **Substituição** — já existe (replace-all da lista de mídias); objeto antigo nunca removido hoje.
4. **Reordenação** — já existe (`order: i` recalculado na mesma submissão, `property-mapper.ts:340`); não envolve o R2 em si, só a ordem no banco.
5. **Exclusão de fotografia** — não existe isolada; é consequência da substituição (item 3).
6. **Exclusão de imóvel** — não existe isolada; só ocorre junto com exclusão de organização.
7. **Exclusão de organização** — existe (`deletarOrganization`), nunca toca o R2.
8. **Falha parcial de upload** — tratada (erro antes de devolver URL, sem órfão nesse caso específico).
9. **Falha de persistência no banco após upload no R2** — caminho real de órfão (arquitetura em duas etapas, upload e "salvar formulário" são requisições separadas).
10. **Falha de exclusão no R2** — hoje só relevante dentro de `limparMidiasOrfas()`; se `DeleteObjectsCommand` falhar no meio de um lote, a função não tem retry nem registra quais chaves do lote falharam especificamente (lança a exceção do SDK, interrompendo o loop — as chaves já removidas em lotes anteriores ficam removidas, as do lote atual e dos seguintes não são processadas).
11. **Recuperação de operações interrompidas** — não existe hoje nenhum mecanismo (nem para upload-sem-salvar, nem para falha no meio de uma limpeza em lote).

## 5.1. Exclusão de fotografias — estratégia proposta

Requisitos do briefing: nunca apagar antes de garantir que não será mais usada; nunca deixar referência quebrada; nunca apagar imagem compartilhada/referenciada por outro registro; nunca cruzar organização.

**Proposta**: introduzir uma função central reutilizável (`src/lib/r2-media.ts`, nova, hoje inexistente — ver achado em `01-ESTADO-ATUAL-VALIDADO.md` item 14) com a assinatura conceitual `removerObjetosR2(chaves: string[], organizationId: string)`, que:
- Valida que TODAS as chaves recebidas começam com `${organizationId}/` antes de qualquer chamada ao SDK (nunca confia no caller sozinho — mesma doutrina de defesa em profundidade já usada em `validarUrlMidiaOrganizacao`).
- É chamada **depois** que a transação de banco que remove a(s) linha(s) `Media` correspondente(s) já foi confirmada com sucesso — nunca antes, para nunca remover um objeto que ainda tem referência válida se a transação de banco falhar.
- Como consequência da ordem acima: se a remoção no R2 falhar DEPOIS da remoção no banco já ter sido confirmada, o resultado é um órfão (objeto no R2 sem referência) — não uma referência quebrada (nunca o contrário: referência no banco apontando para objeto já removido). **Órfão é um resíduo tolerável a ser limpo depois; referência quebrada não é tolerável** (quebraria a exibição da galeria). A ordem proposta prioriza corretamente qual dos dois erros é aceitável.
- "Imagem compartilhada" não se aplica à arquitetura atual — cada `Media.url` é uma chave UUID única por upload, nunca reaproveitada entre registros (confirmado, não há dois `Media` apontando para a mesma URL por design). Esse requisito do briefing já é atendido estruturalmente, sem necessidade de lógica extra.

## 5.2. Exclusão de organizações — estratégia proposta

**Problema central**: depois que `tx.organization.delete()` é executado, não há mais como consultar `Media.url` daquela organização (os dados já foram apagados pelo cascade). A captura dos prefixos/chaves R2 PRECISA ocorrer ANTES da exclusão do banco, nunca depois.

**Proposta de fluxo** (sem introduzir infraestrutura nova — ver `06-CONSISTENCIA-BANCO-STORAGE.md`):

1. **Antes** da transação de exclusão em `deletarOrganization()`, consultar e registrar (fora da transação de delete, só leitura) a lista de prefixos conhecidos daquela organização: `{organizationId}/` cobre todas as pastas (imoveis, hero, perfil, usuarios, site, materiais) — não é preciso listar cada `Media.url` individualmente, o prefixo único por organização já delimita tudo que precisa ser varrido no R2 depois.
2. Gravar esse registro (ex.: uma nova tabela simples, `PlatformStorageCleanupTask`, com `organizationId`, `prefixo`, `status` [PENDENTE/CONCLUIDA/FALHOU], `createdAt`) **antes** de confirmar a exclusão da organização — se a criação desse registro falhar, abortar a exclusão (não deixar a organização ser excluída sem uma tarefa de limpeza pendente registrada).
3. A exclusão do banco (`tx.organization.delete()` e tudo que a acompanha) ocorre normalmente depois.
4. **Exclusão assíncrona do R2**: uma rotina de manutenção DA PLATAFORMA (não da organização, que já não existe) processa as tarefas `PENDENTE`, varrendo o prefixo registrado e removendo os objetos — podendo reaproveitar a mesma lógica de `limparMidiasOrfas()`, generalizada para operar por prefixo de organização já excluída, sem depender de uma sessão ativa dentro dela.
5. **Estados intermediários**: PENDENTE (recém-criada) → EM_PROCESSAMENTO (rotina pegou a tarefa) → CONCLUIDA (todos os objetos do prefixo confirmados removidos) ou FALHOU (erro, elegível para nova tentativa).
6. **Idempotência**: reexecutar a tarefa sobre um prefixo já total ou parcialmente limpo é seguro — `ListObjectsV2` + `DeleteObjectsCommand` sobre um prefixo sem mais objetos simplesmente não encontra nada para remover, sem erro.
7. **Retentativas**: se `EM_PROCESSAMENTO` falhar (exceção do SDK no meio do lote), a tarefa volta para `PENDENTE`/`FALHOU` com contagem de tentativas, para ser reprocessada depois — nunca presumir sucesso sem confirmação explícita do resultado da chamada ao R2.
8. **Logs de auditoria**: cada execução da rotina registra em `PlatformAuditLog` (já existente) quantos objetos foram encontrados/removidos por tarefa — resolve a lacuna já identificada na Fase 119 de "sem rastro de quais chaves foram removidas".
9. **Período de retenção**: propor um atraso mínimo (ex.: a tarefa só é processada 7-30 dias após criada, não imediatamente) — dá uma janela de seguranca caso a exclusão da organização precise ser revertida por engano administrativo (embora a exclusão do BANCO já seja irreversível hoje, por ser `delete` definitivo sem soft-delete — este ponto é uma limitação pré-existente do produto, não introduzida por este plano, e está fora do escopo de imagens corrigir aqui).

## 5.3. Objetos órfãos existentes — descoberta e reconciliação

**Premissa do briefing, reafirmada**: não presumir que todo objeto sem referência no banco pode ser excluído com segurança.

**Mecanismo de descoberta proposto** (inventário, não exclusão):
1. Listar TODOS os objetos do bucket via `ListObjectsV2Command` paginado (mesma técnica já usada em `limparMidiasOrfas()`, generalizada para todo o bucket, não só um prefixo de organização).
2. Para cada objeto, extrair `organizationId` e `pasta` do prefixo da chave.
3. Comparar contra o conjunto de `Media.url` (e, quando a correção de `hero`/`perfil`/`site`/`materiais` também for considerada, os respectivos campos de URL desses outros modelos) **de organizações que ainda existem**.
4. Objetos cujo `organizationId` não corresponde a nenhuma organização existente → candidatos de **alta confiança** (pertencem a uma organização já excluída — "candidato confirmado", não "órfão presumido").
5. Objetos cujo `organizationId` corresponde a uma organização existente, mas sem `Media`/campo correspondente apontando para eles → candidatos de **confiança média** (podem ser órfãos de edição/substituição legítimos, OU podem ser um upload "em voo" ainda não salvo — por isso o limiar de idade de 24h já usado em `limparMidiasOrfas()` deve ser mantido/generalizado).
6. **Nenhuma classificação deve presumir "seguro apagar" sem o limiar de idade E a ausência de referência confirmados juntos.**

**Requisitos do briefing para a execução (nenhum executado aqui)**:
- **Inventário inicial**: relatório read-only listando contagem de candidatos por categoria de confiança, sem apagar nada.
- **Dry-run**: modo padrão de qualquer ferramenta nova deve ser "listar", nunca "executar", exigindo uma segunda chamada/flag explícita para de fato remover.
- **Relatório de candidatos**: exportável (ex.: CSV/JSON) para revisão humana antes de qualquer exclusão em massa.
- **Classificação de confiança**: alta (organização confirmadamente excluída) vs. média (organização existe, sem referência, mas dentro ou fora da janela de idade) — nunca tratar as duas categorias com a mesma política de exclusão automática.
- **Quarentena/retenção**: para candidatos de confiança média, propor mover (não apagar) para um prefixo de quarentena (`{organizationId}/_quarentena/...`) por um período antes da remoção definitiva — dá uma chance de recuperação caso a classificação tenha sido um falso positivo.
- **Aprovação explícita antes de qualquer exclusão real** — nenhuma ferramenta proposta aqui executaria remoção sem confirmação humana explícita e documentada (quem aprovou, quando).
- **Estratégia de recuperação**: para candidatos de confiança média movidos para quarentena, a recuperação é trivial (mover de volta). Para candidatos de alta confiança (organização já excluída) — **não há estratégia de recuperação real, porque não há cópia do dado original em nenhum outro lugar uma vez removido do R2** (nem backup separado de mídia foi encontrado em nenhuma fase anterior). Isso precisa ser dito explicitamente ao proprietário: a exclusão de objetos de organizações já excluídas é, na prática, irreversível, e a única mitigação real é um período de retenção generoso antes de executar.

## 5.4. O que esta fase NÃO decide

Qual exatamente é o período de retenção, o formato da nova tabela de tarefas de limpeza, e se a rotina de processamento roda por cron (hoje inexistente no produto) ou por acionamento manual do Super Admin — tudo isso fica para `08-ROADMAP-TECNICO.md` e `10-DECISOES-PARA-APROVACAO.md`.
