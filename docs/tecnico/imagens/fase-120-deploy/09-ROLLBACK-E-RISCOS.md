# 09 — Rollback e riscos desta publicação

## Risco real desta publicação (escopo reduzido: 120-A + 120-B desligada + 120-C)

- **120-A (validação de URL/cabeçalhos)**: baixo risco. A validação de origem de `FOTO`/`PLANTA` poderia, em teoria, rejeitar uma URL legítima que não siga o padrão esperado — mitigado pela exceção explícita a `data:` (fixtures) e pelo fato de toda URL gerada pelo próprio sistema (upload real) sempre seguir o padrão `{organizationId}/imoveis/{uuid}.{ext}`. Nenhuma URL de produção real deveria cair fora desse padrão.
- **120-B (compressão)**: risco nulo em produção nesta publicação — a funcionalidade está desligada por padrão (`PROPERTY_IMAGE_COMPRESSION_ENABLED` ausente). O código existe mas não é executado.
- **120-C (remoção real ao substituir foto)**: risco médio-baixo — é a primeira vez que o produto remove de fato um objeto R2 fora da ferramenta manual de manutenção. Mitigado por: ordem banco-primeiro-R2 (nunca referência quebrada), isolamento multi-tenant testado, falha de remoção nunca bloqueia a operação principal (vira órfão tolerável, não um erro visível).

## Plano de rollback — aplicação (sem schema envolvido, já que a migration não foi publicada)

Esta publicação **não inclui nenhuma migration** — rollback é só o rollback padrão de aplicação (reverter para o deploy anterior na DigitalOcean, mecanismo nativo da plataforma). Nenhuma consideração de compatibilidade de schema se aplica, porque o schema não mudou.

### Se 120-A causar problema (ex.: rejeitar URL legítima inesperada)
Reverter o commit (ou um revert pontual de `parseMidias`) e fazer novo deploy — sem efeito em dado já persistido (a validação só afeta o que é salvo DAQUI PRA FRENTE; URLs já salvas antes não são revalidadas retroativamente).

### Se 120-C causar problema (ex.: remoção R2 incorreta por algum caso não coberto pelos testes)
Reverter a chamada a `removerObjetosR2` em `atualizarImovel` — volta ao comportamento anterior (só remove do banco, nunca do R2). **Objetos já removidos do R2 antes do rollback não são recuperáveis** — mesma limitação de irreversibilidade já aceita para a ferramenta de manutenção pré-existente (`limparMidiasOrfas`), não uma regressão introduzida por esta fase.

### Se 120-B precisar ser desativada depois de já ter sido ativada no futuro
Só remover/desconfigurar `PROPERTY_IMAGE_COMPRESSION_ENABLED=true` — sem deploy necessário (variável de ambiente). Fotos já reencodadas em WebP permanecem servíveis normalmente (formato já aceito antes desta fase).

## O que NÃO é reversível, dito explicitamente

Qualquer remoção real de objeto R2 (120-C, uma vez em produção) é irreversível — não existe backup de mídia identificado em nenhuma fase anterior deste produto. Isto não é diferente do comportamento já aceito da ferramenta de manutenção pré-existente — é a mesma categoria de risco, agora também presente no fluxo normal de edição de imóvel.

## Etapas 120-D/E — sem risco nesta publicação

Por não serem publicadas, não têm nenhum risco de produção associado a esta rodada. O risco que elas resolveriam (órfãos de organização excluída) permanece exatamente como estava antes de toda a Fase 120 — nem pior, nem melhor.
