# 06 — Consistência entre PostgreSQL e Cloudflare R2

PostgreSQL (Neon) e R2 são dois serviços independentes, sem transação atômica cruzada possível — qualquer operação que envolva os dois precisa de uma estratégia de **consistência eventual**, não de consistência forte.

## Alternativas comparadas

### Compensação em caso de falha (o que já existe hoje, implicitamente)
- Se o upload no R2 tem sucesso mas o salvamento no banco falha (usuário não submete o formulário), não há compensação automática — o objeto fica órfão até a limpeza manual encontrá-lo. **Já é o comportamento atual**, sem mudança de infraestrutura.
- Se a remoção no banco tem sucesso mas a remoção no R2 falha (proposta de `05-CICLO-VIDA-R2.md` §5.1), o resultado é o mesmo tipo de órfão, pelo mesmo motivo — tolerável, coberto pela limpeza.

### Outbox transacional
- Padrão onde a intenção de uma operação externa (ex.: "remover este objeto R2") é gravada na MESMA transação de banco que a mudança de estado principal, e um processo separado lê essa "caixa de saída" e executa a operação externa de fato, marcando como concluída depois.
- **Mapeamento proposto**: a tabela `PlatformStorageCleanupTask` sugerida em `05-CICLO-VIDA-R2.md` §5.2 É, na prática, um outbox — a tarefa de limpeza é registrada na mesma transação (ou imediatamente antes) da exclusão da organização, e processada depois por uma rotina separada.
- **Vantagem**: não exige infraestrutura nova de fila (usa a mesma Postgres já em uso) — aderente à recomendação do briefing de "não introduzir infraestrutura nova sem justificar".
- **Compatibilidade com a arquitetura atual**: alta — é só uma tabela nova + uma rotina que já teria lógica similar à de `limparMidiasOrfas()`.

### Jobs idempotentes
- Qualquer rotina de reconciliação (limpeza de órfãos, reprocessamento de EXIF por organização) deve ser escrita para que reexecutá-la não cause dano, mesmo que a execução anterior tenha sido parcial (ver `05-CICLO-VIDA-R2.md` §5.2 item 6). **Já é uma propriedade natural de operações de listagem+filtro+remoção sobre um prefixo** (confirmado: reexecutar `limparMidiasOrfas()` hoje já é seguro, mesmo sem desenho deliberado para isso) — recomenda-se preservar essa propriedade em qualquer extensão, não introduzir um mecanismo novo.

### Filas de processamento (ex.: um serviço de fila dedicado — SQS, Upstash Qstash, etc.)
- **Não recomendado nesta etapa.** Introduziria um serviço pago/novo (contradiz a instrução de não adicionar infraestrutura nova sem justificar) para um volume de operações (algumas exclusões de organização por período, não milhares de eventos por segundo) que não justifica a complexidade operacional de uma fila dedicada. O padrão outbox sobre a própria Postgres já atende a escala real do produto hoje.

### Tarefas agendadas de reconciliação (cron)
- **Não existe nenhum mecanismo de cron/scheduler no produto hoje** (confirmado em fases anteriores — nenhum `node-cron`, nenhuma config de cron da DigitalOcean/Vercel encontrada). Introduzir um cron real é a MENOR adição de infraestrutura entre as opções pagas, mas ainda é uma mudança de infraestrutura operacional (precisa de um job agendado rodando de forma confiável).
- **Alternativa sem infraestrutura nova**: manter a rotina de reconciliação como uma Server Action acionada manualmente pelo Super Admin (mesmo padrão de `limparMidiasOrfas()` hoje), em vez de automática — mais simples, sem depender de infraestrutura de agendamento, ao custo de depender de alguém lembrar de acionar periodicamente. **Esta é a opção recomendada para a primeira implementação**, com a adição automática de cron como evolução possível depois que o volume de organizações excluídas justificar automação.

## Recomendação consolidada

**Padrão outbox sobre a própria Postgres (tabela `PlatformStorageCleanupTask`) + processamento manual via Server Action (não cron automático) na primeira implementação.** Evita qualquer infraestrutura nova, reaproveita o padrão de idempotência que a limpeza de órfãos já naturalmente tem, e é proporcional ao volume real esperado (exclusões de organização não são um evento de alta frequência).

## Detecção e recuperação de estados inconsistentes

- **Detecção**: uma consulta periódica (manual ou futuramente agendada) que compara `COUNT` de tarefas `PENDENTE`/`FALHOU` em `PlatformStorageCleanupTask` com idade acima de um limiar (ex.: 7 dias sem processamento) — sinaliza que a limpeza está atrasada ou falhando repetidamente.
- **Recuperação**: tarefas `FALHOU` voltam para `PENDENTE` com contagem de tentativas incrementada (mesma lógica de retry já proposta em `05-CICLO-VIDA-R2.md`); acima de um número máximo de tentativas, a tarefa fica `FALHOU` permanentemente e exige investigação manual (alertar via Sentry, já existente no produto, em vez de falhar silenciosamente).
- **Órfãos de upload-sem-salvar** (item 9 do ciclo de vida): continuam cobertos pelo mecanismo já existente (`limparMidiasOrfas()`, limiar de 24h) — não precisam do outbox, porque nunca houve uma operação de banco bem-sucedida da qual compensar; são simplesmente objetos nunca referenciados, o problema que a ferramenta de limpeza já resolve.

## Justificativa de não introduzir infraestrutura nova

Consistente com a instrução do briefing ("priorizar uma solução compatível com a arquitetura atual e com os custos de uma operação SaaS ainda em crescimento"): o volume real (exclusões de organização, reprocessamento pontual de fotos antigas) é baixo o suficiente para que uma tabela de controle + processamento manual seja proporcional. Introduzir fila/cron pago agora seria over-engineering para o estágio atual do produto — a mesma doutrina já aplicada em outras decisões de infraestrutura registradas nas Fases 117/118 (não fazer upgrade da Neon, não criar staging remoto sem necessidade comprovada).
