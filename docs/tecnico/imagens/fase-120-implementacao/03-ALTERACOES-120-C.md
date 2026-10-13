# 03 — Etapa 120-C: Exclusão segura de fotografias e consistência banco/R2

## Status: IMPLEMENTADO e TESTADO LOCALMENTE

## Módulo reutilizável de remoção R2

Novo `src/lib/r2-media.ts`:
- `removerChavesR2(bucket, chaves)` — nível mais baixo: remove em lotes de até 1000 (limite da API S3/R2), nunca lança (falha de um lote é contabilizada em `lotesComFalha` e logada, sem interromper os demais lotes nem propagar exceção). Idempotente por natureza da própria API (remover chave inexistente não é erro).
- `removerObjetosR2(urls, organizationId)` — nível mais alto: converte URL completa em chave (`chaveDeUrlR2`), **rejeita e nunca envia ao SDK** qualquer URL que não comece com `${organizationId}/` — nunca confia só na filtragem de quem chamou (mesma doutrina de defesa em profundidade da Fase 119).
- Extraído de `limparMidiasOrfas` (único lugar que tinha essa lógica antes, duplicada inline) — `limparMidiasOrfas` (`src/app/app/manutencao/actions.ts`) **não foi alterada nesta fase**, continua com sua própria implementação (risco de duplicação registrado, não resolvido aqui — ver `10-PENDENCIAS-E-RISCOS.md`).

## Integração com a exclusão/substituição de foto

`src/app/app/imoveis/actions.ts`, `atualizarImovel`:
1. **Antes** da transação de banco: lê o estado atual de `Media`/`PropertyPresentationMaterial` daquele imóvel (`midiasAntigas`, `materiaisAntigos`).
2. A transação de banco roda normalmente (substitui a lista completa, como já era).
3. **Só depois** da transação confirmar com sucesso: calcula a diferença entre URLs antigas e novas, e chama `removerObjetosR2` só para o que de fato saiu da lista.

Esta ordem (banco primeiro, R2 depois) é a mesma decidida em `docs/tecnico/imagens/fase-120/05-CICLO-VIDA-R2.md` — nunca gera referência quebrada (se o R2 falhar depois do banco já confirmado, o resultado é um objeto órfão tolerável, não uma `Media` apontando para nada).

`criarImovel` não precisou de mudança — não há "antes" para diferenciar na criação.

## Testes executados (resultados reais)

`tests/integration/imovel-remocao-r2.test.ts` (nova, 3 testes, **todos passaram**):
- Foto removida da lista → linha `Media` apagada **e** objeto R2 efetivamente removido (confirmado via mock do SDK S3); foto mantida nunca é tocada.
- Nenhuma foto removida → nenhuma chamada de exclusão ao R2.
- **Isolamento multi-tenant**: cenário adversarial em que uma linha `Media` da organização A aponta (por erro hipotético) para uma chave da organização B — `removerObjetosR2` rejeita e nunca envia essa chave ao R2.

`src/lib/r2-media.test.ts` (novo, 10 testes, **todos passaram**): extração de chave, rejeição de URL de outra organização/host externo, idempotência (chamar duas vezes não lança), divisão em lotes de 1000, falha de lote contabilizada sem lançar, comportamento sem R2 configurado, lista vazia.

## O que NÃO foi implementado nesta etapa

Exclusão individual de IMÓVEL isolada continua não existindo (nunca existiu no produto — só existe junto com exclusão de organização, Etapa 120-D). Não havia requisito de criar essa funcionalidade nova, só de corrigir a consistência do que já existe.
