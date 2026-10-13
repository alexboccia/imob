# 08 — Roadmap de implementação (proposto, não executado)

Etapas pequenas, testáveis e reversíveis — nenhuma foi executada nesta fase. Ordem sugerida por dependência técnica e por risco crescente.

## Etapa 1 — Compressão no servidor para fotos de imóvel (reaproveitando o padrão do Hero)

- Estender `src/app/api/admin/upload/route.ts` para também reprocessar `pasta === "imoveis"` com uma função análoga a `processarImagemHero()` (novo módulo dedicado, parâmetros próprios de largura máxima/qualidade — não reaproveitar os limites específicos do Hero, que são para outro propósito visual).
- **Testável**: teste unitário comparando tamanho/dimensões antes e depois, teste de que a orientação EXIF é corrigida, teste de que o resultado final não tem tag GPS. Teste de integração/E2E confirmando que o fluxo de cadastro de imóvel continua funcionando ponta a ponta.
- **Reversível**: é uma mudança isolada em um único branch condicional da rota de upload — reverter é remover a chamada nova, sem efeito em fotos já armazenadas (que continuam servíveis como estão, já que o formato de saída recomendado, WebP, já é aceito pela allowlist de leitura hoje).
- **Risco**: baixo — mesma dependência (`sharp`) já usada e testada em produção para outro fluxo.

## Etapa 2 — Validação de origem da URL de mídia de imóvel (`validarUrlMidiaOrganizacao`)

- Alinhar `src/lib/property-mapper.ts`/`src/app/app/imoveis/actions.ts` ao padrão já usado por materiais/hero/perfil/logo — validar que toda URL de FOTO/VIDEO/PLANTA pertence ao prefixo `{organizationId}/imoveis/` antes de persistir.
- **Testável**: teste de que uma URL fora do padrão (outra organização, outro host) é rejeitada; teste de que URLs legítimas continuam funcionando.
- **Reversível**: validação adicional, não remove nenhum comportamento existente — reverter é remover a chamada de validação.
- **Risco**: baixo, mas exige atenção ao tipo `VIDEO` (que hoje é link de embed externo, não upload — a validação precisa distinguir isso e só exigir o prefixo do R2 para FOTO/PLANTA, nunca para VIDEO de embed).

## Etapa 3 — Extensão do escopo de `limparMidiasOrfas()` + modo dry-run

- Estender a varredura para todas as pastas por organização (não só `imoveis/`); adicionar um modo padrão "só relatar" com confirmação explícita para executar a remoção real; registrar em log de auditoria quais chaves foram removidas.
- **Testável**: teste de que o dry-run nunca chama `DeleteObjectsCommand`; teste de que o escopo continua restrito à organização da sessão (isolamento multi-tenant).
- **Reversível**: mudança aditiva na mesma função existente.
- **Risco**: baixo — não altera o comportamento de remoção já existente, só amplia escopo e adiciona uma camada de segurança (dry-run) antes dele.

## Etapa 4 — Capturar/processar órfãos no momento da exclusão de organização

- Antes (ou como parte) de `deletarOrganization()`, listar os prefixos R2 daquela organização e registrar uma pendência de limpeza (ex.: uma tabela/log simples "pendências de limpeza R2 por organização excluída"), já que depois da exclusão a ferramenta de manutenção atual não consegue mais alcançá-los.
- **Testável**: teste de que a lista de prefixos capturada corresponde exatamente ao que existia antes da exclusão.
- **Reversível**: aditivo — não altera a transação de exclusão em si, só adiciona uma etapa de registro antes/depois dela.
- **Risco**: médio — exige decidir onde/como essa pendência é processada depois (uma rotina de nível de plataforma, já que a organização não existe mais) — esse desenho fica para quando esta etapa for de fato aprovada, não decidido aqui.

## Etapa 5 (opcional, menor prioridade) — Cabeçalhos de cache/disposição explícitos no upload

- Definir `CacheControl` (ex.: cache longo + imutável, já que a chave é um UUID único por arquivo — nunca é "a mesma foto" sendo atualizada no lugar, é sempre uma chave nova) e `ContentDisposition: attachment` para a pasta `materiais` (mitiga o risco de PDF com JavaScript sendo aberto inline).
- **Testável**: teste de que o cabeçalho é enviado corretamente no `PutObjectCommand`.
- **Reversível**: mudança isolada de parâmetros do SDK.
- **Risco**: baixo.

## Ordem recomendada

1 (compressão) e 2 (validação de origem) podem ser feitas em paralelo, são independentes. 3 (dry-run) antes de 4 (pendência de exclusão), já que 4 se beneficia de 3 já existir. 5 é independente e de baixa prioridade, pode ser feita a qualquer momento.

**Nenhuma etapa foi iniciada nesta fase.** Cada uma exigiria sua própria aprovação e, seguindo o padrão de trabalho já estabelecido no projeto, prova RED→GREEN antes de qualquer merge.
