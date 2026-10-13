# 09 — Decisões pendentes (aguardando o proprietário)

Somente decisões que exigem aprovação — não itens já resolvidos tecnicamente.

1. **Aprovar a implementação de compressão no servidor para fotos de imóvel** (reaproveitando o padrão já em produção do Hero: sharp + WebP + correção de orientação EXIF + remoção automática de metadados) — resolve simultaneamente o achado de privacidade (EXIF/GPS) e a ausência de otimização de armazenamento/desempenho.
2. **Aprovar os parâmetros técnicos de compressão** antes de fixá-los: largura máxima armazenada e qualidade WebP (`03-ESTRATEGIAS-OTIMIZACAO.md` sugere qualidade 82 como ponto de partida, mesma do Hero, mas recomenda um teste visual real com fotos de imóvel antes de confirmar — interiores com pouca luz podem exigir qualidade mais alta que fachadas bem iluminadas).
3. **Aprovar a correção da validação de origem da URL de mídia de imóvel** (`validarUrlMidiaOrganizacao`, hoje ausente só para FOTO/VIDEO/PLANTA, presente em todo o resto do produto) — correção pequena e isolada.
4. **Decidir se/quando reprocessar fotos já existentes** (retroativamente) depois que a compressão de novos uploads estiver implementada, ou se elas permanecem como estão indefinidamente.
5. **Aprovar a extensão da ferramenta de limpeza de órfãos** (`limparMidiasOrfas()`) para cobrir todas as pastas, com modo dry-run obrigatório e log de auditoria — e decidir o período de retenção antes de remoção definitiva.
6. **Decidir como tratar os órfãos gerados por exclusão de organização já ocorridas no passado** (se houver alguma) — isso exigiria uma investigação adicional contra o bucket de produção real, fora do escopo autorizado desta fase.
7. **Decidir se vale medir uma amostra real de tamanho de foto no bucket de produção** antes de fixar os parâmetros de compressão, para calibrar expectativa de economia real (os cenários desta fase são ilustrativos, não medidos).
8. **Confirmar se os limites comerciais propostos (150/500/1.500 imóveis, 15/20/40 fotos) seguem para aprovação formal** — esta auditoria não encontrou impedimento técnico de custo, mas a decisão comercial final permanece com o proprietário (ver `07-IMPACTO-PLANOS.md`).
9. **Priorizar (ou não) a implementação de um painel de monitoramento de consumo de armazenamento por organização** — hoje inexistente, não bloqueante, mas recomendado como melhoria de observabilidade.
