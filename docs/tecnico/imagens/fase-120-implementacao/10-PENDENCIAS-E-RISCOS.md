# 10 — Pendências e riscos

## Pendências bloqueantes antes de produção

1. **Validação visual humana** das fotos processadas pelo novo pipeline (Etapa B), usando fotos reais de imóvel (interior, exterior, diferentes condições de luz) — esta fase só validou com imagens sintéticas (cor sólida) e com as mesmas premissas já aceitas para o Hero. Qualidade 82/2048px pode precisar de ajuste depois dessa validação.
2. **Decisão formal sobre quando/se habilitar `LEGACY_REPROCESS_ENABLED`** e, antes disso, desenhar e implementar o reencode retroativo de verdade (hoje só existe o gate que recusa).
3. **Aplicar a migration em produção** via o procedimento já estabelecido (job de pre-deploy) antes de qualquer organização ser excluída em produção depender do outbox.

## Riscos conhecidos, não resolvidos nesta fase

- **Duplicação de lógica entre `limparMidiasOrfas` (pré-existente) e os novos módulos `r2-media.ts`/`storage-cleanup.ts`/`orphan-inventory.ts`** — `limparMidiasOrfas` não foi refatorada para reaproveitar `removerChavesR2`, por prudência (evitar alterar uma ferramenta de manutenção já em produção sem necessidade comprovada nesta fase). Fica como melhoria futura registrada, não um defeito urgente.
- **Quarentena de órfãos não implementada** — o inventário classifica mas nunca move/isola um candidato antes da decisão de remoção definitiva. Qualquer remoção em lote de órfãos de confiança média continuaria dependendo de revisão manual completa, sem uma rede de segurança adicional além do dry-run.
- **Heurística de "foto legada" por extensão é aproximada** (`classificarMidiaPorExtensao`) — um `.webp` pode ter sido enviado diretamente antes da Fase 120-B, sem nunca ter passado pelo pipeline de remoção de EXIF. Não há forma confiável de diferenciar isso retroativamente sem reprocessar (o que esta fase decidiu não fazer).
- **Tempo de processamento do Sharp sob carga não medido** — não há dado real de quanto tempo o processamento de uma foto de 10MB leva no ambiente de produção (DigitalOcean), nem de como isso se comporta sob múltiplos uploads simultâneos. Risco já identificado na Fase 118/120 (processo compartilhado, sem fila dedicada) — não mitigado, apenas reconhecido.
- **Inventário de órfãos só compara contra `Media.url`** — outras pastas (hero/perfil/site/materiais) podem ter objetos em uso que a classificação atual erroneamente marcaria como "confiança média" por não cruzar contra os models corretos (`OrganizationBranding`, `PropertyPresentationMaterial`, etc.). Documentado explicitamente no próprio código (`src/lib/orphan-inventory.ts`) como limitação da primeira versão — por isso a classificação nunca autoriza remoção automática.

## Impacto potencial sobre tenants existentes

- Fotos já armazenadas (sem compressão, com EXIF potencialmente presente) **não são afetadas automaticamente** por nenhuma mudança desta fase — continuam exatamente como estavam até alguém decidir (fora desta fase) acionar um reprocessamento real, que hoje nem existe.
- Nenhuma organização real teve dado modificado, removido ou reprocessado durante o desenvolvimento desta fase.

## Decisões que ainda exigem aprovação do proprietário (consolidado de `docs/tecnico/imagens/fase-120/10-DECISOES-PARA-APROVACAO.md`, agora com o que já foi implementado)

As 10 decisões já estavam aprovadas antes desta rodada de implementação (ver Parte 3 do briefing da Fase 120-implementação) — nenhuma decisão nova foi requisitada aqui. O que falta agora é só autorização operacional específica para:
1. Validar visualmente o resultado da compressão antes de considerar produção.
2. Aplicar a migration em produção.
3. Decidir, caso a caso, quando processar manualmente uma tarefa de limpeza real (sempre após os 30 dias, sempre com dry-run revisado antes).
4. Decidir se/quando desenhar o reencode retroativo de fotos legadas (ainda não implementado).
