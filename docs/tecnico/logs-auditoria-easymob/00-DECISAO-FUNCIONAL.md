# 00 — Decisão funcional aprovada

**Diagnóstico de referência**: `docs/tecnico/DIAGNOSTICO-LOGS-AUDITORIA-EASYMOB.md`.

**Decisão aprovada pelo proprietário**: o EasyMob oferecerá duas operações distintas para Imóveis e Clientes:

1. **Arquivar** — retira o registro do fluxo operacional normal, preservando dados, com restauração possível.
2. **Excluir definitivamente** — remoção irreversível, restrita a administradores autorizados, com confirmação explícita e auditoria obrigatória.

Esta decisão aprova a diretriz **funcional**. Não autoriza, por si só, a execução de exclusões reais nem alterações em produção — cada etapa segue com seu próprio checkpoint de aprovação.

## Plano incremental (visão geral)

| Etapa | Objetivo | Status |
|---|---|---|
| 1 | Corrigir lacunas de auditoria (exclusões sem rastro) | Concluída, aprovada |
| 2 | Tela de Logs de Auditoria para administradores das imobiliárias | Concluída, aprovada |
| 3 | Auditoria de alterações importantes (antes/depois) | Concluída |
| 4 | Arquivamento de Imóveis e Clientes (backend + interface) | **Concluída** |
| 5 | Exclusão definitiva restrita (backend + interface) | **Concluída** |
| 6 | Ampliação de cobertura (Comissões, Pipeline) | Concluída parcialmente — Assinaturas sem ação a auditar |

Ver `03-CONCLUSAO-FINAL.md` (backend), `04-INTERFACES-E-HOMOLOGACAO-LOCAL.md` (interface), `05-HOMOLOGACAO-FINAL.md` (homologação visual real, parecer de prontidão) e `06-PUBLICACAO-PRODUCAO.md` (correções finais e publicação bloqueada por segurança — rotação de credencial pendente) para o relatório completo.

Cada etapa é documentada em seu próprio arquivo nesta pasta, seguindo o formato: o que foi implementado, o que não foi alterado, arquivos modificados, testes, resultados, riscos, necessidade de migration, impacto esperado, próximo checkpoint.
