# 11 — Checklist pré-implementação

A verificar antes de iniciar qualquer etapa do roadmap (`08-ROADMAP-TECNICO.md`) numa fase futura de implementação.

## Pré-requisitos

- [ ] Decisões 1-10 de `10-DECISOES-PARA-APROVACAO.md` respondidas pelo proprietário.
- [ ] Perfil de qualidade (A/B/C) e seus parâmetros exatos confirmados.
- [ ] Amostra real de fotos de imóvel (variedade de iluminação/ambiente) disponível para teste visual antes de fixar os parâmetros de compressão.
- [ ] Ambiente de teste/local disponível para validar o pipeline de compressão antes de qualquer deploy (mesmo padrão já usado em fases anteriores — nunca testar upload/compressão direto em produção).
- [ ] Para as Etapas C/D: ambiente de teste com uma organização descartável, para validar exclusão/limpeza sem risco a dado real.

## Riscos bloqueantes (precisam estar endereçados antes de começar)

- [ ] Confirmar que a mudança de extensão de arquivo (`.jpg`/`.png` → `.webp` para novos uploads) não quebra nenhuma integração/consumo externo não mapeado nesta auditoria (ex.: se algum material comercial/anúncio gerado referenciar a extensão do arquivo original de forma hardcoded — não encontrado nesta auditoria, mas não exaustivamente verificado para esse ponto específico, **NÃO VERIFICADO — exige validação antes da implementação**).
- [ ] Confirmar que não há nenhum processo externo (fora do código deste repositório) que dependa do padrão atual de ausência de `CacheControl` nos objetos R2 — **NÃO VERIFICADO**, mas risco considerado baixo dado que não há CDN customizada conhecida configurada.
- [ ] Para a Etapa D: confirmar que a nova tabela `PlatformStorageCleanupTask` não conflita com nenhuma convenção de nomenclatura/migração já em andamento no momento da implementação (checar `prisma/migrations/` mais recentes antes de gerar a nova migration).

## Critérios de início (gate antes de cada etapa)

- **Etapa A**: nenhum pré-requisito além da aprovação da decisão 3.
- **Etapa B**: aprovação do perfil de qualidade (decisão 2) + amostra de fotos reais disponível para validação visual.
- **Etapa C**: Etapa B concluída e estável em produção por um período mínimo de observação (sugestão: pelo menos um ciclo de uso real, não imediatamente após o deploy).
- **Etapa D**: Etapa C concluída e estável; decisões 6-8 respondidas (tabela, retenção, modo de processamento).
- **Etapa E**: Etapas B, C e D concluídas e estáveis; decisão 4 (estratégia para fotos legadas) respondida.

## Critérios de conclusão de cada etapa

- Todos os testes de `09-PLANO-DE-TESTES.md` relevantes àquela etapa passando.
- Nenhuma regressão na suíte de testes existente do produto (gate já estabelecido em todas as fases anteriores: tsc, eslint, vitest, build, Playwright).
- Para Etapa B: validação visual humana explícita de uma amostra real, documentada.
- Para Etapas C/D: teste de falha simulada (R2 indisponível, banco falhando) confirmando que a ordem de operações nunca gera referência quebrada.
- Para Etapa D especificamente: teste de dry-run confirmado como realmente não-destrutivo antes de qualquer execução real, mesmo em ambiente de teste.

## Revalidação final antes de qualquer fase de implementação real

Repetir a Etapa 1 desta fase (revalidação do estado atual, `01-ESTADO-ATUAL-VALIDADO.md`) no início da fase de implementação, para confirmar que nenhuma mudança não relacionada ocorreu no código entre o planejamento (esta fase) e a execução — mesma disciplina já seguida em todas as fases anteriores deste projeto ("reconstruir o estado real antes de agir, nunca presumir o baseline").
