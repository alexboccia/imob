# 10 — Decisões para aprovação

Decisões objetivas, com alternativas e impacto de cada escolha. Nenhuma foi tomada nesta fase.

## 1. Aprovar a implementação da compressão no servidor (Etapa B)

- **Alternativas**: não implementar (manter como está) / implementar.
- **Impacto de aprovar**: resolve privacidade (EXIF/GPS) e reduz armazenamento/tráfego ~75-90%; exige validação visual antes de produção.
- **Impacto de não aprovar**: risco de privacidade permanece; nenhuma mudança de custo (hoje irrelevante de qualquer forma).
- **Recomendação desta auditoria**: aprovar.

## 2. Escolher o perfil de qualidade (A/B/C)

- **Alternativas**: Perfil A (Econômico, qualidade 70) / Perfil B (Equilibrado, qualidade 82 — recomendado) / Perfil C (Alta qualidade, qualidade 90) / perfis diferenciados por plano.
- **Impacto de cada escolha**: ver `02-ARQUITETURA-COMPRESSAO.md` — A maximiza redução mas arrisca qualidade perceptível; C preserva fidelidade mas reduz menos; B reaproveita parâmetro já validado em produção (Hero).
- **Recomendação**: Perfil B como padrão único inicial; diferenciação por plano fica como evolução futura, não decidida agora.

## 3. Aprovar a correção de validação de origem de URL para mídia de imóvel (Etapa A)

- **Alternativas**: corrigir agora (alinhar ao padrão já usado em materiais/hero/perfil/logo) / manter como está.
- **Impacto de aprovar**: fecha uma inconsistência de defesa em profundidade; risco de regressão baixo (nenhuma URL legítima deveria ser rejeitada).
- **Impacto de não aprovar**: lacuna permanece, risco classificado como Médio em `04-SEGURANCA-MULTITENANT.md`.
- **Recomendação**: aprovar — é a correção de menor custo/risco de todo o roadmap.

## 4. Decidir a estratégia para fotos já existentes (legadas)

- **Alternativas**: não modificar / reprocessar gradualmente toda a base / reprocessar por organização sob demanda / reprocessar só mediante solicitação administrativa.
- **Impacto de cada escolha**: ver `03-PRIVACIDADE-EXIF-GPS.md` — reprocessar em massa é a operação de maior risco de reversibilidade de todo este planejamento.
- **Recomendação**: não modificar em massa; manter reprocessamento por organização disponível como ferramenta sob demanda (Alternativa 3), nunca automático.

## 5. Aprovar o módulo reutilizável de remoção R2 e sua aplicação à exclusão individual de foto (Etapa C)

- **Alternativas**: construir o módulo agora / manter a duplicação atual (lógica só dentro de `manutencao/actions.ts`) e não estender a remoção real a outros fluxos.
- **Impacto de aprovar**: fotos substituídas passam a ter seu objeto R2 removido de fato (reduz acúmulo de órfãos "rotineiros"); exige a ordem correta banco-depois-R2 (`05-CICLO-VIDA-R2.md`) para nunca gerar referência quebrada.
- **Recomendação**: aprovar, depois da Etapa B (dependência de extensão de arquivo).

## 6. Aprovar a criação da tabela `PlatformStorageCleanupTask` e o fluxo de captura de prefixo antes da exclusão de organização (Etapa D)

- **Alternativas**: implementar o outbox proposto (tabela + processamento manual) / introduzir fila/cron dedicado (mais infraestrutura, não recomendado agora) / não resolver o problema (manter órfãos permanentes de organização excluída).
- **Impacto de aprovar**: resolve o achado mais grave da Fase 119 (órfãos irrecuperáveis de organização excluída); exige nova migration de schema (aditiva).
- **Impacto de não aprovar**: o problema mais grave identificado permanece sem solução.
- **Recomendação**: aprovar; é a correção de maior importância de segurança/higiene operacional de todo o roadmap, apesar de ser a de maior complexidade.

## 7. Definir o período de retenção antes de remoção definitiva de objetos de organização excluída

- **Alternativas**: sem período de espera (processar imediatamente) / 7 dias / 30 dias / outro valor.
- **Impacto**: período maior = mais tempo de janela de segurança contra erro administrativo, mas mais tempo de armazenamento "morto" acumulado (custo irrelevante, ver `07-CUSTOS-E-CAPACIDADE.md`) antes da limpeza real.
- **Recomendação**: 30 dias, dado que o custo de manter um pouco mais de armazenamento é irrelevante frente ao risco de uma exclusão irreversível por engano.

## 8. Decidir se a rotina de processamento de tarefas de limpeza roda manualmente (Super Admin aciona) ou de forma automática (cron)

- **Alternativas**: manual (recomendado para a primeira implementação) / cron automático (exige nova infraestrutura de agendamento, hoje inexistente no produto).
- **Recomendação**: manual na primeira implementação; cron como evolução futura se o volume de organizações excluídas justificar.

## 9. Confirmar que os limites comerciais consolidados (150/500/1.500 imóveis, 15/20/40 fotos) seguem válidos para o planejamento técnico

- Esta auditoria não encontrou impedimento técnico de custo nesses limites (`07-CUSTOS-E-CAPACIDADE.md`) — confirmação é apenas para registro, não exige nenhuma mudança de plano nesta fase.

## 10. Decidir se cabeçalhos `CacheControl`/`ContentDisposition` explícitos (Etapa A) entram no mesmo lote de mudança da validação de URL

- **Recomendação**: sim, por serem mudanças pequenas e isoladas na mesma rota, reduz o número de ciclos de deploy/revisão.
