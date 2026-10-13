# 09 — Plano de testes (a implementar em fases futuras, nenhum executado aqui)

Nenhum teste foi executado nesta fase. Lista de casos a cobrir quando cada etapa do roadmap (`08-ROADMAP-TECNICO.md`) for implementada.

## Upload

| Caso | Resultado esperado |
|---|---|
| JPEG válido | Aceito, processado (após Etapa B), armazenado como WebP |
| PNG válido | Aceito, processado, transparência preservada |
| WebP válido | Aceito, reprocessado (reencode normaliza mesmo entrada já WebP) |
| Arquivo corrompido (bytes inválidos após o cabeçalho) | Rejeitado com erro claro, sem exceção não tratada |
| MIME type falsificado (ex.: `.exe` renomeado para `.jpg` com `Content-Type: image/jpeg` mas sem os magic bytes corretos) | Rejeitado na validação de assinatura (já existente, reconfirmar que continua funcionando após as mudanças) |
| Extensão incompatível com o MIME real | Rejeitado |
| Arquivo acima do limite (>10MB) | Rejeitado com HTTP 413 |
| Dimensões excessivas (ex.: imagem de poucos KB mas dimensões gigantescas, tipo decompression bomb) | Rejeitado pelo limite de pixels decodificados (`LIMITE_PIXELS_ENTRADA`) |
| Imagem panorâmica (proporção muito larga) | Aceita, redimensionada preservando proporção, sem distorção |
| Imagem com transparência (PNG) | Aceita, canal alfa preservado na saída WebP |
| Imagem com orientação EXIF (ex.: foto vertical de celular marcada como landscape+rotação) | Orientação corrigida corretamente na saída (visualmente vertical) |

## Compressão

| Caso | Resultado esperado |
|---|---|
| Qualidade visual | Amostra de fotos reais de imóvel, avaliada por humano, sem artefato perceptível grosseiro no Perfil recomendado |
| Redução de tamanho | Arquivo de saída mensuravelmente menor que o original para fotos típicas (não garantido para arquivos já muito pequenos/comprimidos — ver caso abaixo) |
| Correção de orientação | Mesma verificação do item de upload, especificamente no contexto do pipeline de compressão |
| Remoção de GPS | Decodificar o resultado e confirmar ausência de tag EXIF GPS, mesmo quando o original tinha |
| Ausência de metadados sensíveis | Confirmar ausência de qualquer bloco EXIF/IPTC/XMP no resultado, não só GPS |
| Preservação de proporção | Largura/altura do resultado mantêm a mesma razão do original (dentro da margem de arredondamento de pixel) |
| Tratamento de falhas do Sharp | Decodificação de um arquivo inválido lança erro tratado (HTTP 400), nunca uma exceção não capturada que derrube a requisição |
| Conversão que aumentaria o tamanho | Se o resultado comprimido for maior que o original, o original é usado em vez do resultado (ver proposta em `02-ARQUITETURA-COMPRESSAO.md`) |

## Multi-tenant

| Caso | Resultado esperado |
|---|---|
| Organização A não acessa arquivo privado da B | Não aplicável a fotos já públicas (de imóveis AVAILABLE); para DRAFT/INACTIVE, confirmar que a PÁGINA pública não expõe a URL (já é o comportamento — reconfirmar que a correção de URL da Etapa A não introduz um vazamento novo) |
| Organização A não exclui arquivo da B | Confirmar que a nova função `removerObjetosR2` (Etapa C) rejeita qualquer chave fora do prefixo da organização autenticada, mesmo que acidentalmente submetida |
| Usuário sem permissão não faz upload | Reconfirmar `PAPEIS_POR_PASTA` continua aplicado após as mudanças |
| Referência de URL externa é rejeitada | Submeter uma URL de domínio externo (não R2) como mídia de imóvel — deve ser rejeitada pela validação da Etapa A |
| Chaves R2 manipuladas são rejeitadas | Submeter uma URL no mesmo host do R2, mas com prefixo de outra organização — deve ser rejeitada pela validação da Etapa A |

## Exclusão

| Caso | Resultado esperado |
|---|---|
| Exclusão individual (substituição de foto) | Linha `Media` removida do banco E objeto removido do R2 (Etapa C) |
| Exclusão de imóvel | Não aplicável isoladamente hoje (não existe essa ação) — cobrir só o caso de exclusão de organização |
| Exclusão de organização | Tarefa de limpeza criada com o prefixo correto ANTES da exclusão do banco ser confirmada (Etapa D) |
| Falha do R2 (simulada, ex.: mock de erro do SDK) | Operação de banco já confirmada permanece válida; objeto fica órfão tolerável, sem erro visível ao usuário final |
| Falha do banco (a transação de exclusão de `Media` falha) | Objeto no R2 NUNCA é removido antes da confirmação do banco (ordem correta, `05-CICLO-VIDA-R2.md`) |
| Operação interrompida (processo encerrado no meio do processamento de uma tarefa de limpeza) | Reexecutar a tarefa (idempotente) completa o que faltou, sem duplicar nem falhar por já ter sido parcialmente processada |
| Retentativa | Tarefa `FALHOU` reprocessada com sucesso na segunda tentativa transiciona corretamente para `CONCLUIDA` |
| Idempotência | Reexecutar a limpeza sobre um prefixo já totalmente limpo não gera erro, só confirma "nada a fazer" |
| Objeto compartilhado | Não aplicável à arquitetura atual (cada `Media.url` é uma chave única, nunca compartilhada) — teste de regressão para confirmar que isso continua verdadeiro após as mudanças |
| Objeto órfão (de edição/substituição) | Identificado corretamente pelo inventário (confiança média), nunca removido sem o limiar de idade + dry-run + aprovação |
| Objeto sem identificação confiável (chave fora do padrão esperado, ex.: criada manualmente fora do fluxo normal) | Inventário classifica como "não identificável automaticamente", nunca entra na lista de remoção automática — exige revisão manual |

## Regressão (obrigatória antes de qualquer deploy de qualquer etapa)

| Caso | Resultado esperado |
|---|---|
| Hero institucional continua funcionando | Upload/exibição do Hero inalterado (nenhuma das mudanças desta fase toca o módulo do Hero) |
| Galerias dos imóveis continuam funcionando | Fotos existentes (sem o novo processamento) continuam exibidas corretamente |
| Site público continua exibindo fotografias | Nenhuma quebra de renderização em `[orgSlug]/imoveis/[id]` |
| Upload de múltiplas fotos mantém ordem e limites | `order` continua correto; `verificarLimiteFotos` continua enforced |
| Fotografias existentes continuam acessíveis | URLs antigas (formato `.jpg`/`.png`, sem compressão) continuam servíveis normalmente — o novo pipeline não invalida nada já armazenado |
| Nenhum fluxo de outra organização é afetado | Suíte de testes multi-tenant existente do produto continua passando sem alteração |

## Observação sobre execução

Nenhum destes testes foi executado nesta fase (fora do escopo documental autorizado) — a lista serve de especificação para quando cada etapa do roadmap for de fato implementada, seguindo o padrão já estabelecido no projeto de prova RED→GREEN antes de qualquer merge.
