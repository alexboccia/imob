# 09 — Runbook operacional

Distinção explícita pedida pelo briefing: funcionalidade implementada vs. testada localmente vs. ainda não ativada vs. dependente de migration vs. que exige autorização para operar vs. pendente de validação em produção.

| Funcionalidade | Implementada | Testada localmente | Ativa por padrão | Depende de migration | Exige autorização adicional para operar | Validada em produção |
|---|---|---|---|---|---|---|
| Validação de origem de URL (FOTO/PLANTA) | Sim | Sim | **Sim, automaticamente após deploy** | Não | Não | Não |
| Compressão Sharp+WebP em `imoveis` | Sim | Sim | **Sim, automaticamente após deploy** | Não | **Validação visual com fotos reais antes de produção (não feita nesta fase)** | Não |
| Cabeçalhos `CacheControl`/`ContentDisposition` | Sim | Sim | **Sim, automaticamente após deploy** | Não | Não | Não |
| Remoção real de objeto R2 ao substituir foto | Sim | Sim | **Sim, automaticamente após deploy** | Não | Não | Não |
| Outbox `PlatformStorageCleanupTask` (criação da tarefa) | Sim | Sim | **Sim, automaticamente após deploy e migration** | **Sim** | Não (automático, parte da exclusão de organização) | Não |
| Processamento manual de limpeza (exclusão real no R2) | Sim | Sim (com SDK mockado) | Não — exige Super Admin acionar manualmente, e só após 30 dias | Sim (tabela precisa existir) | **Sim — ação manual, irreversível, com confirmação textual obrigatória** | Não |
| Inventário de fotos legadas | Sim | Sim | Sim (só leitura, sem risco) | Não | Não | Não |
| Reprocessamento de fotos legadas (execução real) | **Não** (só o gate que recusa) | Sim (confirma que recusa) | Não | Não | **Sim — `LEGACY_REPROCESS_ENABLED=true` + implementação real do reencode ainda não construída** | Não |
| Inventário de objetos órfãos (bucket inteiro) | Sim | Sim | Sim (só leitura) | Não | Não | Não |
| Quarentena de órfãos | **Não implementada** | — | — | — | — | — |

## Como ativar o processamento manual de limpeza (quando autorizado)

1. Confirmar que a migration `20261013011821_add_platform_storage_cleanup_task` foi aplicada em produção (via o mesmo mecanismo de `scripts/migrate-deploy.ts` já em uso).
2. Esperar uma organização real ser excluída (gera a tarefa automaticamente) e os 30 dias de retenção passarem.
3. Super Admin acessa `/platform/storage-cleanup`, clica em "Pré-visualizar (dry-run)" e revisa a contagem/tamanho de objetos antes de decidir.
4. Só então digita o slug exato da organização e confirma — a exclusão real ocorre nesse momento, sem retorno possível.

## Como (eventualmente) ativar o reprocessamento de fotos legadas

**Não recomendado nesta fase** — a trava `LEGACY_REPROCESS_ENABLED` existe, mas o código por trás dela (`reprocessarFotosLegadas`) ainda recusa incondicionalmente, porque o reencode retroativo de verdade não foi desenhado nem implementado. Ativar a variável de ambiente hoje não teria efeito algum além de passar a primeira checagem — a segunda barreira (função não implementada) permanece.

## Pendências antes de qualquer ativação em produção

Ver `10-PENDENCIAS-E-RISCOS.md` e `11-CHECKLIST-PRE-DEPLOY.md`.
