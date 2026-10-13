# 11 — Checklist pré-deploy

**Nenhum item desta lista foi executado como parte do deploy — esta fase não realizou deploy.**

## Pré-requisitos

- [ ] Revisão de código por um segundo humano (nenhuma revisão por outra pessoa ocorreu nesta sessão — foi um único desenvolvimento local).
- [ ] Validação visual com fotos reais de imóvel (ver `10-PENDENCIAS-E-RISCOS.md`, item 1) — **bloqueante para a Etapa 120-B**.
- [ ] Confirmar que `R2_BUCKET_NAME`/`R2_PUBLIC_URL`/credenciais R2 de produção continuam exatamente as mesmas (nenhuma mudança de configuração foi proposta ou é necessária por esta implementação).
- [ ] Aplicação da migration `20261013011821_add_platform_storage_cleanup_task` em produção, pelo procedimento já estabelecido (job de pre-deploy).
- [ ] Confirmar que `LEGACY_REPROCESS_ENABLED` **não** está definida em produção (deve permanecer ausente/false — é a configuração padrão esperada).

## Riscos bloqueantes

- Compressão (Etapa B) entra em vigor para TODO novo upload de foto de imóvel imediatamente após o deploy — não há uma forma de ativar gradualmente (não foi pedido nem desenhado um feature flag para essa etapa especificamente, ao contrário da Etapa E). Se a validação visual (pendência 1) não tiver sido feita antes do deploy, o risco de qualidade visual inadequada já estaria em produção para todos os novos uploads a partir desse momento — **por isso a validação visual é bloqueante, não opcional**.
- A criação da tarefa de limpeza (Etapa D) também entra em vigor imediatamente para qualquer exclusão de organização após o deploy (automática, dentro da mesma transação) — isso é desejado e seguro (só grava uma linha, não apaga nada a mais), mas exige a migration já aplicada antes do deploy do código, nunca depois (a transação falharia se a tabela não existisse).

## Critérios de início (antes de habilitar qualquer execução manual real)

- Processamento manual de limpeza: só depois que existir pelo menos uma organização real excluída em produção, com a tarefa correspondente visível em `/platform/storage-cleanup`, e só depois dos 30 dias de retenção.
- Inventário de órfãos: pode ser executado a qualquer momento após o deploy — é só leitura, sem pré-requisito adicional além de acesso Super Admin.

## Critérios de conclusão (desta fase de implementação local)

- [x] Todos os 5 passos (A-E) implementados.
- [x] `npm run test` — **3776 testes, 195 arquivos, todos aprovados**.
- [x] `npm run lint` — aprovado, sem avisos.
- [x] `npx tsc --noEmit` — aprovado, sem erros.
- [x] `npm run build` — aprovado, sem erro de bundling client/server.
- [ ] `npm run test:e2e` — ver `06-TESTES-E-EVIDENCIAS.md` para o resultado real (executado em paralelo à escrita desta documentação).
- [x] Nenhuma exclusão real executada (confirmado: todo teste que toca `@aws-sdk/client-s3` usa mock).
- [x] Nenhuma fotografia legada alterada.
- [x] Nenhuma configuração de produção alterada.
- [x] Drift pré-existente preservado (`src/app/layout.tsx`, `public/demo-fotos/`).
- [x] Nenhum commit, push ou deploy realizado.
