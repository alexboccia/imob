# 03 — Auditoria de storage R2 e consistência; outbox (excluída desta publicação)

## R2 — o que está sendo publicado (Etapas A e C)

- **Uploads**: inalterado (autenticação, papel por pasta, rate limit, validação de arquivo) — só a chave/cabeçalho mudam (120-A) e o conteúdo pode ser reencodado quando o gate de compressão estiver ligado (120-B, desligado nesta publicação).
- **Chaves/prefixos**: sempre `${organizationId}/${pasta}/${uuid}.${extensao}`, gerado no servidor — inalterado.
- **Cabeçalhos**: `CacheControl: public, max-age=31536000, immutable` (seguro, chave sempre nova por upload) e `ContentDisposition` (`attachment` para materiais/PDF, `inline` para o resto) — novos, sem efeito em objetos já existentes.
- **URLs públicas**: inalteradas.
- **Exclusão/substituição de fotografia** (120-C): `src/lib/r2-media.ts` — novo módulo reutilizável, integrado em `atualizarImovel` para remover de fato o objeto R2 quando uma foto é substituída/removida, sempre na ordem banco-confirmado-depois-R2. Testado (`tests/integration/imovel-remocao-r2.test.ts`, `src/lib/r2-media.test.ts` — 13 testes no total, reexecutados nesta auditoria).
- **Exclusão de imóvel**: não existe isolada (nunca existiu) — fora do escopo desta publicação.
- **Exclusão de organização**: **NÃO MODIFICADA nesta publicação** — `deletarOrganization` foi revertida ao comportamento original (ver `10-STATUS-FINAL.md`), porque a captura de prefixo (120-D) depende da tabela `PlatformStorageCleanupTask`, que não foi migrada em produção.

## Confirmação explícita: nenhuma operação consegue excluir objeto de outra organização

`removerObjetosR2(urls, organizationId)` rejeita e nunca envia ao SDK qualquer chave que não comece com `${organizationId}/` do chamador — testado com cenário adversarial em que uma linha `Media` da própria organização A aponta (por erro hipotético) para uma chave de B; a chamada rejeita, nunca remove nada de B. Nenhuma URL arbitrária é transformada em chave de exclusão sem essa checagem — confirmado por leitura: a única forma de obter uma chave é via `chaveDeUrlR2`, que já exige que a URL comece com `R2_PUBLIC_URL`.

## Consistência PostgreSQL/R2 — cenários de falha (Etapa C, publicada)

| Cenário | Comportamento confirmado |
|---|---|
| Upload R2 ok, gravação no banco falha | Já era o comportamento antes desta fase — sem mudança; o objeto fica órfão até a ferramenta manual de limpeza (`limparMidiasOrfas`, pré-existente) encontrá-lo |
| Banco atualizado, remoção R2 falha | `removerObjetosR2` nunca lança — falha de lote é contabilizada e logada; resultado é um objeto órfão tolerável, nunca uma referência quebrada no banco (a ordem é sempre banco-primeiro) |
| Substituição interrompida | A transação de banco é atômica (`$transaction`); se falhar, nada muda e a remoção no R2 nunca é tentada (só ocorre depois da transação confirmada) |
| Exclusão repetida (reenviar a mesma edição) | Idempotente — remover uma chave já removida não é erro (comportamento padrão da API `DeleteObjects`) |
| Objeto inexistente | Idem — sem erro |
| Falha temporária de rede | Contabilizada em `lotesComFalha`, logada, não propagada — o fluxo principal (salvar o imóvel) nunca falha por causa disso |
| Processamento concorrente de duas edições do mesmo imóvel | Não investigado nesta rodada especificamente (fora do escopo das correções desta publicação) — risco pré-existente do próprio modelo de edição (replace-all), não introduzido por esta fase |
| Reinício da aplicação durante a operação | A chamada a `removerObjetosR2` ocorre depois do `await` da transação de banco já resolvido — um reinício nesse meio tempo deixaria o mesmo resultado tolerável (objeto órfão), nunca referência quebrada |

## Outbox `PlatformStorageCleanupTask` (Etapa 120-D) — EXCLUÍDA desta publicação

Implementada e testada localmente (9 testes de integração, todos aprovados na rodada de implementação) — modelo, migration, captura de prefixo antes da exclusão, retenção de 30 dias, processamento manual protegido, concorrência, retentativa. **Nada disso está sendo publicado nesta rodada.** Motivo: a migration que cria a tabela depende de um mecanismo de backup/recuperação de produção comprovadamente utilizável, que esta auditoria não conseguiu confirmar (ver `04-MIGRATION-E-BACKUP.md`). Mantida como trabalho local pronto para uma fase futura, assim que essa pendência for resolvida.

Consequência prática: **a lacuna já conhecida (exclusão de organização não limpa R2) permanece em produção exatamente como estava antes de toda a Fase 120** — nenhuma regressão (o comportamento não piora), mas também nenhuma correção ainda chega a produção para esse ponto específico.

## Operações destrutivas — confirmação

Nenhuma operação de limpeza real, reprocessamento em massa, ou exclusão administrativa extraordinária foi executada ou fica exposta por esta publicação. O inventário de órfãos e o reprocessamento de legado (Etapa 120-E) também não foram publicados — ver `10-STATUS-FINAL.md`.
