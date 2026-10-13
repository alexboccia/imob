# 03 — Privacidade: EXIF e GPS

## Novas fotografias

A remoção de metadados é um **efeito colateral automático** do reencode proposto em `02-ARQUITETURA-COMPRESSAO.md`: `sharp` não preserva EXIF ao reencodar, a menos que `.withMetadata()` seja explicitamente chamado (confirmado no padrão já em produção do Hero, que não chama esse método). Ou seja, **implementar a compressão do Perfil B já resolve a remoção de GPS/EXIF sem nenhuma lógica adicional dedicada** — não é um mecanismo separado, é a mesma mudança.

Ordem correta dentro do pipeline (crítica, já destacada no briefing): **corrigir orientação ANTES de descartar os metadados** — `.rotate()` precisa ser chamado durante o mesmo pipeline de decodificação que descarta o resto do EXIF, nunca depois (se o arquivo já tivesse sido salvo sem o `.rotate()`, a informação de orientação original já teria se perdido, e a imagem ficaria salva de lado/invertida permanentemente). O padrão do Hero já faz isso na ordem certa (`hero-image-processar.ts:65`, `.rotate()` chamado antes do `.resize()`/`.webp()` na mesma cadeia) — replicar exatamente essa ordem.

**Risco de preservar metadado por engano**: só aconteceria se alguém, numa implementação futura, chamasse `.withMetadata()` sem necessidade (ex.: copiado de outro contexto que precisa preservar metadados). Mitigação proposta: um teste automatizado que decodifica o resultado de um upload de teste e assevera explicitamente que não há tags EXIF de GPS no buffer de saída — não depender só de "não chamar a função", e sim ter um teste que falharia se alguém reintroduzir isso no futuro.

## Fotografias já existentes (antigas)

Quatro alternativas comparadas, nenhuma executada:

### Alternativa 1 — Não modificar, tratar só novos uploads
- **Vantagens**: zero risco de alterar produção, zero custo de reprocessamento, implementação mais simples e rápida.
- **Limitações**: fotos já publicadas continuam expondo GPS/EXIF indefinidamente, se presente no arquivo original.
- **Custo**: nenhum.

### Alternativa 2 — Reprocessar gradualmente (toda a base, em lotes pequenos ao longo do tempo)
- **Vantagens**: resolve o problema para toda a base eventualmente, sem pico de carga.
- **Limitações**: exige um job/rotina de background que hoje não existe no produto (nenhum mecanismo de fila/cron foi encontrado em nenhuma fase anterior); precisa reescrever o objeto no R2 com uma NOVA chave ou sobrescrever a mesma chave (decisão de desenho não trivial — ver riscos de reversibilidade em `09-ROADMAP-TECNICO.md`/`rollback`); exige atualizar `Media.url` no banco se a chave mudar.
- **Custo**: médio — trabalho de engenharia real para construir o mecanismo de lote, mesmo que pequeno.

### Alternativa 3 — Reprocessar por organização (sob demanda, uma organização inteira por vez)
- **Vantagens**: permite priorizar organizações de maior risco/visibilidade primeiro (ex.: a futura Imobiliária Demo, que será pública); escopo menor e mais fácil de validar/reverter por execução.
- **Limitações**: ainda exige o mesmo mecanismo técnico de reencode em lote da Alternativa 2, só que disparado manualmente por organização em vez de automaticamente para toda a base.
- **Custo**: médio, mas com janela de risco menor por execução (mais fácil de testar/validar antes de expandir).

### Alternativa 4 — Reprocessar mediante solicitação administrativa (um botão "remover metadados desta foto/deste imóvel", acionado manualmente)
- **Vantagens**: controle total, zero automação, zero risco de rodar em massa por engano.
- **Limitações**: depende de alguém lembrar de acionar — não resolve o problema de forma abrangente nem automática; útil como complemento, não como solução principal.
- **Custo**: baixo técnico, alto operacional (depende de ação humana recorrente).

## Recomendação

**Alternativa 1 (não modificar fotos antigas) combinada com Alternativa 3 (reprocessamento por organização, sob demanda) como ferramenta disponível, não automática.** Justificativa: implementar a compressão para novos uploads (Perfil B) já estanca o problema para todo conteúdo futuro, que é a maior parte do volume de longo prazo. Reprocessar retroativamente TODA a base hoje é uma operação de escrita em produção sobre dado já publicado — risco desproporcional ao benefício imediato, dado que não há evidência (nem pedido nesta fase) de que uma organização específica já sofreu exposição real de GPS. Fica disponível a Alternativa 3 como ferramenta pontual, para ser acionada quando/se uma organização específica (ex.: a Imobiliária Demo antes de sua criação pública, ou qualquer cliente real que solicite) precisar da remoção retroativa.

**Nenhuma execução de reprocessamento foi realizada nesta fase.**

## Evitar exposição acidental de arquivos originais durante o processamento

Enquanto o reencode não existir, o arquivo original já é o que fica public-facing (não há cópia "privada" dele hoje). Quando a compressão for implementada, o fluxo proposto nunca grava o arquivo original no R2 — ele existe só em memória (`Buffer`) durante o processamento da requisição e é descartado ao final, exatamente como o Hero já funciona hoje (o buffer original passado para `processarImagemHero` nunca é persistido, só o resultado reencodado). **Nenhuma cópia adicional do arquivo original seria criada** pela implementação proposta.

## Rastreabilidade sem dados pessoais desnecessários

Qualquer log de auditoria de reprocessamento (se a Alternativa 3 for acionada) deve registrar: organização, quantidade de fotos processadas, data/hora, operador que acionou — **nunca** o conteúdo do EXIF removido (coordenadas GPS específicas) nem o nome original do arquivo além do que já é sanitizado hoje (`sanitizarNomeLogico`, já em produção).

## Nota sobre classificação jurídica

Esta fase **não classifica juridicamente** se os metadados GPS de uma foto de imóvel constituem dado pessoal sensível sob a LGPD em cada caso concreto (depende de contexto — ex.: se a foto é de uma residência privada identificável vs. um imóvel comercial já publicamente divulgado) — trata-se apenas como um risco de exposição de localização a ser mitigado por boas práticas técnicas, sem presumir ou declarar uma classificação legal definitiva. Qualquer declaração de conformidade jurídica formal está fora do escopo desta auditoria técnica.
