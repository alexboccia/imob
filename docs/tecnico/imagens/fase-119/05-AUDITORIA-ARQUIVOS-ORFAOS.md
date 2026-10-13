# 05 — Auditoria de exclusão e arquivos órfãos

**Método**: leitura direta do código, incluindo a transação completa de exclusão de organização e a única ferramenta de limpeza existente. Nenhuma exclusão foi executada.

## 1. Exclusão de fotografias individuais

Confirmado: **não existe uma ação de "excluir esta foto"** isolada no backend — a edição do imóvel sempre envia a lista completa de mídias desejada, e o Server Action substitui tudo de uma vez (`src/app/app/imoveis/actions.ts`, em torno da linha 325-359). Remover uma foto no formulário = ela simplesmente não está mais na lista enviada.

## 2. Substituição de fotografias

Mesmo mecanismo do item 1 — a foto "removida" (ausente da nova lista) tem sua linha `Media` apagada do banco (`prisma.media.deleteMany`, `imoveis/actions.ts:354`), mas **o objeto correspondente nunca é apagado do R2** — confirmado por comentário explícito no próprio código (linhas 325-329): *"Remover um material aqui não apaga o objeto no R2 — exatamente como já acontece com foto removida."* Isto é um comportamento **intencional e documentado**, não um bug acidental — a limpeza é delegada à ferramenta manual do item 9.

## 3. Exclusão de imóveis

**Não existe uma ação isolada de "excluir este imóvel"** fora da exclusão completa de uma organização (busca ampla por `property.delete`/`excluirImovel` não encontrou nenhuma). Um imóvel só deixa de existir junto com toda a organização (item 4) ou passa a ter status `INACTIVE` (nunca removido).

## 4. Exclusão de organizações — risco mais severo encontrado

`deletarOrganization()` (`src/app/platform/organizations/[id]/actions.ts:397-467`), ação real, acessível pelo Super Admin via UI (com confirmação por digitação do slug exato):

- Roda uma transação Prisma com ~25 `deleteMany`/`delete` em cascata (pagamentos → faturas → assinaturas → overrides → ... → imóveis → pessoas → ... → organização).
- `tx.property.deleteMany({ where: { organizationId } })` (linha 442) aciona o `onDelete: Cascade` do banco em `Media.property` (`prisma/schema.prisma:645`) — **todas as linhas `Media` daquela organização desaparecem do banco automaticamente**.
- **Em nenhum ponto da transação há uma chamada ao cliente R2** (`client.send`, `DeleteObjectCommand`, `DeleteObjectsCommand`) — confirmado por leitura completa da função. Os arquivos físicos (fotos de imóvel, materiais de apresentação, foto de perfil, logo, favicon, hero) permanecem no bucket R2 indefinidamente.
- **Agravante confirmado**: depois que a organização é apagada, nem a ferramenta manual de limpeza (`limparMidiasOrfas()`) consegue mais alcançar esses arquivos — ela exige `requireOrganizationId()` de uma sessão ativa DENTRO daquela organização (`src/app/app/manutencao/actions.ts:30`), que já não existe mais depois da exclusão. **Isto é uma fonte real, confirmada e hoje irreversível de acúmulo de armazenamento órfão, crescendo a cada organização excluída.**

## 5. Falhas durante upload

Se `PutObjectCommand` falhar, a rota retorna erro antes de devolver qualquer URL ao cliente (`route.ts:174-189`) — não há órfão nesse caso específico (nada foi persistido em lugar nenhum).

## 6. Falhas entre gravação no R2 e persistência no banco

**Caminho real de órfão, confirmado pela própria arquitetura em duas etapas**: `POST /api/admin/upload` grava no R2 e devolve a URL (sucesso garantido nesse ponto); o Server Action do imóvel só persiste essa URL como linha `Media` depois, em uma submissão SEPARADA do formulário. Se o usuário enviar a foto e nunca submeter o formulário (navegar para outra página, fechar a aba, sessão expirar, falha de validação impedindo o envio), **o objeto fica no R2 sem nenhuma linha `Media` apontando para ele** — órfão desde o primeiro minuto.

## 7. Referências de imagem que não existem mais

Não encontrado nenhum caso onde `Media.url` apontaria para um objeto R2 já removido (o único removedor de objetos, item 9, sempre remove em sincronia com a ausência de uma linha `Media` correspondente, nunca o contrário).

## 8. Objetos R2 sem referência no banco (órfãos) — consolidado

Três origens reais e confirmadas:
1. Edição/substituição de foto (item 2) — rotineiro, por design, nunca limpo automaticamente.
2. Upload sem submissão do formulário (item 6) — eventual, inerente à arquitetura em duas etapas.
3. Exclusão de organização (item 4) — grave, permanente, sem ferramenta de recuperação hoje.

## 9. Ferramentas existentes de limpeza

**Uma única ferramenta**: `limparMidiasOrfas()` (`src/app/app/manutencao/actions.ts:14-88`):
- Ação manual, disparada por um Super Admin/gestor da própria organização (papel `PAPEIS_MANUTENCAO`), nunca automática/agendada (sem cron/fila encontrada em todo o repositório).
- **Escopo de isolamento multi-tenant confirmado como seguro**: o prefixo de busca/exclusão é sempre `${organizationId}/imoveis/` (linha 43), vindo da sessão do próprio operador — **não há caminho pelo qual essa ferramenta possa apagar arquivo de outra organização**, mesmo que o bucket contenha objetos de todas elas.
- **Escopo de pasta limitado**: só varre `imoveis/` — órfãos em `hero/`, `perfil/`, `usuarios/`, `site/`, `materiais/` nunca são alcançados por ela.
- Limiar de idade de 24h antes de considerar um objeto elegível para remoção (evita apagar um upload "em voo", ainda não salvo).
- Exclusão em lotes de até 1.000 chaves por chamada (`DeleteObjectsCommand`, respeitando o limite da própria API R2/S3).
- **Sem modo dry-run**: a função já executa a exclusão real na mesma chamada — não há como "só listar o que seria apagado" sem de fato apagar.
- **Sem log de auditoria das chaves específicas removidas** — retorna só `{ totalObjetos, totalRemovidas }` (contagens), não grava em `ActivityLog`/`PlatformAuditLog` quais arquivos foram removidos.

## Possibilidade de exclusão acidental de arquivo de outra organização

**Não encontrada.** O prefixo de varredura/exclusão é sempre derivado da sessão autenticada do operador, nunca de um parâmetro de entrada controlável — não há vetor para apagar fora do próprio prefixo da organização do operador.

## Estratégia de limpeza segura proposta (não implementada — para aprovação)

Para resolver os 3 pontos de órfão (item 8) sem repetir os limites da ferramenta atual:

1. **Estender o escopo de `limparMidiasOrfas()`** para cobrir todas as pastas por organização (`hero/`, `perfil/`, `usuarios/`, `site/`, `materiais/`), não só `imoveis/`.
2. **Adicionar modo dry-run obrigatório por padrão**: a chamada padrão só lista/relata o que seria removido (contagem + chaves + idade), exigindo uma segunda confirmação explícita para executar a remoção real — reduz risco de execução acidental.
3. **Registrar em log de auditoria (`ActivityLog`/`PlatformAuditLog`) exatamente quais chaves foram removidas, quando e por quem** — hoje não há rastro, o que impede qualquer tentativa de recuperação ou investigação pós-fato.
4. **Resolver o caso de organização já excluída**: antes de apagar uma organização, capturar a lista de prefixos R2 associados a ela (ou simplesmente executar a limpeza de órfãos ANTES de excluir a organização, como etapa obrigatória do fluxo de `deletarOrganization`) e/ou registrar os prefixos num log de "pendências de limpeza R2" que uma rotina de manutenção da PLATAFORMA (não da organização, que já não existe mais) possa processar posteriormente.
5. **Período de segurança/retenção antes de remover**: manter o limiar de 24h já existente (ou ampliá-lo) para órfãos de edição/substituição; para órfãos gerados por exclusão de organização, considerar uma retenção mais longa (ex.: 30 dias) antes da remoção definitiva, dado que a reversão é impossível depois.
6. **Idempotência**: a operação de listar+filtrar+apagar já é naturalmente idempotente (reexecutar não piora nada, só processa o que ainda está pendente) — manter essa propriedade em qualquer extensão.
7. **Execução em lotes com limite de tempo/quantidade por chamada** (já existe, manter) para não estourar timeout de Server Action em buckets muito grandes.

**Nenhuma destas propostas foi implementada nesta fase** — ficam registradas para aprovação e desenho detalhado numa fase de implementação futura.
