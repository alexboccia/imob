# 08 — Roadmap técnico (proposto, nenhuma etapa executada)

A ordem sugerida no briefing (A→E) foi avaliada e **mantida**, com ajustes de dependência explicados abaixo.

## Etapa A — Segurança do upload

**Objetivo**: validação real de conteúdo, correção da lacuna de validação de origem de URL, isolamento multi-tenant reforçado.

- **Arquivos provavelmente afetados**: `src/lib/property-mapper.ts` (`parseMidias`), `src/app/api/admin/upload/route.ts` (adicionar `CacheControl`/`ContentDisposition`), `src/lib/upload-validation.ts` (sem mudança estrutural, só reaproveitado).
- **Dependências**: nenhuma — pode começar imediatamente, não depende de A/B posteriores.
- **Alterações de schema**: nenhuma.
- **Riscos**: baixo — validação adicional não deveria rejeitar nenhum upload legítimo hoje em produção (todas as URLs geradas pelo próprio sistema já seguem o padrão esperado); risco só existiria se houver algum dado legado fora do padrão (não verificado, ver `09-PLANO-DE-TESTES.md`).
- **Testes**: casos de URL de outra organização rejeitada, URL de outro host rejeitada, URL legítima aceita, upload normal continua funcionando ponta a ponta.
- **Critérios de aceite**: nenhuma regressão nos testes E2E existentes de cadastro/edição de imóvel; novo teste de rejeição de URL cruzada passa.
- **Rollback**: remover a chamada de validação adicionada — reverte ao comportamento atual sem efeito em dados já persistidos.
- **Impacto em produção**: nenhum durante a implementação (só validação de novas submissões); zero risco a dados existentes.
- **Janela de manutenção**: não necessária.
- **Complexidade**: baixa.
- **Aprovações necessárias**: aprovação técnica da correção (item 3 de `10-DECISOES-PARA-APROVACAO.md`).

## Etapa B — Compressão

**Objetivo**: estender sharp+WebP (padrão já em produção no Hero) para a pasta `imoveis`.

- **Arquivos provavelmente afetados**: novo módulo `src/lib/property-image-processar.ts` (análogo a `hero-image-processar.ts`), `src/app/api/admin/upload/route.ts` (nova ramificação condicional para `pasta === "imoveis"`).
- **Dependências**: nenhuma técnica direta da Etapa A, mas recomenda-se fazer A primeiro (ou junto) porque ambas tocam a mesma rota de upload — menor custo de revisão/teste fazer as duas mudanças próximas no tempo.
- **Alterações de schema**: nenhuma (o campo `Media.url` continua sendo uma única string; a extensão do arquivo muda de `.jpg`/`.png` para `.webp`, mas isso já é suportado pela allowlist de leitura — `next/image` já renderiza WebP hoje).
- **Riscos**: médio — é a mudança de maior impacto direto na qualidade visual percebida; exige validação visual humana antes de produção (não só teste automatizado).
- **Testes**: ver `09-PLANO-DE-TESTES.md` §Compressão.
- **Critérios de aceite**: amostra de fotos reais de imóvel (variedade de iluminação/ambiente) aprovada visualmente por um humano antes do deploy; testes automatizados de orientação/remoção de GPS/redução de tamanho passam.
- **Rollback**: desativar a ramificação condicional nova (feature flag simples por variável de ambiente, ou revert do commit) — fotos JÁ enviadas com o novo pipeline continuam sendo WebP válido e servível (não precisa reverter dado já armazenado); só uploads NOVOS voltariam ao comportamento antigo (sem compressão) até a causa do problema ser corrigida.
- **Impacto em produção**: baixo durante a mudança (só afeta novos uploads a partir do deploy); fotos antigas não são tocadas (ver Etapa E).
- **Janela de manutenção**: não necessária (mudança aditiva, sem downtime).
- **Complexidade**: média (reaproveita padrão existente, mas exige calibração de qualidade visual real).
- **Aprovações necessárias**: perfil de qualidade (A/B/C, `02-ARQUITETURA-COMPRESSAO.md`) e seus parâmetros exatos (itens 1-2 de `10-DECISOES-PARA-APROVACAO.md`).

## Etapa C — Exclusão individual e de imóveis; consistência banco/R2

**Objetivo**: construir o módulo reutilizável de remoção de objetos R2 (`05-CICLO-VIDA-R2.md` §5.1) e aplicá-lo à substituição/remoção de foto já existente (hoje só remove do banco).

- **Arquivos provavelmente afetados**: novo `src/lib/r2-media.ts` (extraindo/generalizando a lógica hoje só inline em `manutencao/actions.ts`), `src/app/app/imoveis/actions.ts` (chamar a remoção real depois da transação de banco confirmada).
- **Dependências**: **depende da Etapa B estar concluída** (se a compressão mudar a extensão para `.webp`, a lógica de remoção precisa lidar com qualquer extensão legada também, não só a nova) — por isso vem depois, não em paralelo.
- **Alterações de schema**: nenhuma.
- **Riscos**: médio-alto — é a primeira etapa que de fato REMOVE objetos do R2 fora da ferramenta de manutenção manual já existente; exige a ordem correta (banco primeiro, R2 depois) descrita em `05-CICLO-VIDA-R2.md` para nunca gerar referência quebrada.
- **Testes**: ver `09-PLANO-DE-TESTES.md` §Exclusão — especialmente falha simulada do R2 depois do banco já confirmado (deve resultar em órfão tolerável, nunca em erro visível ao usuário).
- **Critérios de aceite**: remover uma foto de um imóvel de teste resulta no objeto R2 correspondente também removido (verificável via `ListObjectsV2`); nenhuma referência quebrada em nenhum cenário de teste, incluindo falha simulada do R2.
- **Rollback**: reverter para "só remove do banco" (comportamento atual) é sempre seguro — órfãos resultantes continuam sendo limpos pela ferramenta de manutenção já existente.
- **Impacto em produção**: médio — primeira mudança que exclui dado físico fora de uma ação manual deliberada; recomenda-se rollout gradual (ex.: só para novas edições, nunca em lote retroativo).
- **Janela de manutenção**: não necessária.
- **Complexidade**: média.
- **Aprovações necessárias**: item 5 de `10-DECISOES-PARA-APROVACAO.md`.

## Etapa D — Exclusão de organizações e reconciliação; objetos órfãos

**Objetivo**: implementar a tabela de tarefas de limpeza (`PlatformStorageCleanupTask`, `05-CICLO-VIDA-R2.md` §5.2) e a rotina de processamento; implementar a ferramenta de inventário/dry-run para órfãos existentes (`05-CICLO-VIDA-R2.md` §5.3).

- **Arquivos provavelmente afetados**: `prisma/schema.prisma` (nova tabela), nova migration, `src/app/platform/organizations/[id]/actions.ts` (`deletarOrganization`, adicionar a captura de prefixo antes da exclusão), nova Server Action de processamento de tarefas pendentes, nova Server Action de inventário/dry-run de órfãos.
- **Dependências**: depende da Etapa C (reaproveita o módulo `r2-media.ts` generalizado).
- **Alterações de schema**: **sim** — nova tabela `PlatformStorageCleanupTask` (migration aditiva, sem alterar tabela existente).
- **Riscos**: alto — é a etapa que lida com o caso mais grave já identificado (órfãos de organização excluída, hoje irrecuperáveis); qualquer erro de desenho aqui tem a mesma característica de irreversibilidade do problema que está corrigindo.
- **Testes**: ver `09-PLANO-DE-TESTES.md` §Exclusão de organização, §Objetos órfãos — incluindo teste de que o dry-run NUNCA chama `DeleteObjectsCommand`.
- **Critérios de aceite**: exclusão de uma organização de teste gera exatamente uma tarefa `PENDENTE` com o prefixo correto; processar a tarefa remove os objetos daquele prefixo e marca `CONCLUIDA`; dry-run do inventário de órfãos produz um relatório sem nenhuma chamada de exclusão real.
- **Rollback**: a tabela nova pode ser simplesmente não processada (tarefas ficam acumuladas como `PENDENTE` sem efeito) se a rotina de processamento precisar ser revertida — não afeta o funcionamento do resto do produto. A migration de schema (aditiva) não precisa ser revertida só por reverter a lógica de processamento.
- **Impacto em produção**: médio-alto — primeira vez que exclusão de organização passa a ter um efeito colateral (criação de tarefa); recomenda-se testar extensivamente em ambiente de staging/local antes de habilitar em produção.
- **Janela de manutenção**: não estritamente necessária (mudança aditiva), mas recomendável comunicar a mudança de comportamento ao Super Admin antes de habilitar.
- **Complexidade**: alta — é a etapa mais sensível de todo o roadmap.
- **Aprovações necessárias**: itens 5-7 de `10-DECISOES-PARA-APROVACAO.md` (período de retenção, formato da tabela, política de tentativas).

## Etapa E — Imagens legadas, testes e observabilidade

**Objetivo**: decidir e eventualmente executar (em fase futura própria, não nesta) o reprocessamento de fotos antigas; consolidar suíte de testes de regressão; adicionar monitoramento de uso de armazenamento por organização.

- **Arquivos provavelmente afetados**: nova Server Action de reprocessamento por organização (se a Alternativa 3 de `03-PRIVACIDADE-EXIF-GPS.md` for aprovada); testes novos em `tests/` cobrindo `09-PLANO-DE-TESTES.md`; eventual painel/relatório de consumo (não especificado em detalhe aqui, fica para desenho próprio).
- **Dependências**: depende de B, C e D já estarem em produção e estáveis — reprocessar fotos antigas usando um pipeline recém-implementado sem tempo de maturação em produção é um risco desproporcional.
- **Alterações de schema**: possivelmente nenhuma (reprocessamento gera uma nova chave R2 e atualiza `Media.url` existente, sem campo novo) — a decidir no desenho detalhado quando esta etapa for aprovada.
- **Riscos**: médio — reprocessamento retroativo é a única operação deste roadmap que ALTERA dado já publicado; qualquer erro de qualidade visual afeta conteúdo que já estava correto.
- **Testes**: suíte completa de `09-PLANO-DE-TESTES.md`.
- **Critérios de aceite**: amostra de reprocessamento validada visualmente antes de qualquer execução em lote maior; nenhuma foto fica inacessível durante/depois do reprocessamento.
- **Rollback**: manter a chave/URL antiga até confirmar que a nova está correta e servível (não apagar o original até ter certeza) — estratégia de duas fases (gerar novo, validar, só então apagar o antigo) reduz o risco de perda.
- **Impacto em produção**: alto SE EXECUTADA em lote sobre toda a base — por isso a recomendação de `03-PRIVACIDADE-EXIF-GPS.md` é não fazer isso automaticamente, só sob demanda e por organização.
- **Janela de manutenção**: recomendável para qualquer execução em lote maior, mesmo que a operação em si não exija downtime (reduz surpresa/suporte durante o reprocessamento).
- **Complexidade**: média-alta, por ser a etapa de maior risco de reversibilidade.
- **Aprovações necessárias**: item 4 de `10-DECISOES-PARA-APROVACAO.md`.

## Resumo de dependências

```
A (segurança upload) ──┐
                        ├──> C (exclusão individual) ──> D (exclusão de org + órfãos) ──> E (legado/observabilidade)
B (compressão) ─────────┘
```

A e B podem ser feitas em paralelo ou em qualquer ordem entre si; C depende de B; D depende de C; E depende de B, C e D.
