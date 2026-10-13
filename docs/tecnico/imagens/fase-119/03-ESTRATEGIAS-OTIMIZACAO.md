# 03 — Estratégias de otimização (comparação, sem implementação)

## Alternativa A — Compressão no navegador (antes do upload)

Processar a imagem no próprio dispositivo do corretor (JavaScript no navegador, ex.: biblioteca `browser-image-compression` ou a `Canvas API` nativa) antes de enviar ao servidor.

- **Vantagens**: reduz o volume de dados já no upload (menos tempo de envio em conexão de celular, menos CPU gasto no servidor/DO lendo o buffer).
- **Limitações**: (1) **não há nenhuma dependência de compressão client-side no projeto hoje** (confirmado — nenhuma lib desse tipo em `package.json`), seria uma dependência nova; (2) qualidade e comportamento variam por navegador/dispositivo (CPU mais lenta em celulares antigos pode gerar travamento perceptível na UI durante a compressão); (3) **nunca pode ser a única camada de defesa** — um cliente HTTP direto (sem navegador) pode simplesmente pular a compressão e enviar o arquivo bruto de 10MB mesmo assim, então o servidor precisaria SEMPRE revalidar/reprocessar de qualquer forma para garantir o limite real; (4) a arquitetura atual já tem um ponto único de validação no servidor (`upload-validation.ts`) — introduzir lógica de compressão no cliente sem uma validação equivalente no servidor criaria uma falsa sensação de segurança.

## Alternativa B — Compressão no servidor (antes de gravar no R2)

Reaproveitar o padrão já existente e testado do Hero (`sharp`, `src/lib/hero-image-processar.ts`) para a pasta `imoveis`: decodificar, corrigir orientação EXIF, redimensionar para uma largura máxima, reencodar para WebP com qualidade fixa, e só então gravar no R2.

- **Vantagens**: (1) reaproveita 100% do padrão já em produção (mesma dependência `sharp`, já usada em 4 outros pontos do código: hero, og-imagem, anúncio de imóvel, paleta de logo — nenhuma dependência nova); (2) garante o mesmo resultado **independente de quem/o que está enviando** (navegador, app mobile futuro, importação em massa futura) — defesa real, não dependente do cliente; (3) remove EXIF/GPS automaticamente como efeito colateral do reencode (resolve o achado de privacidade de `06-SEGURANCA-IMAGENS.md`); (4) resultado previsível e mensurável (ver economia estimada em `04-SIMULACAO-ARMAZENAMENTO.md`).
- **Custo em CPU/memória/tempo**: o processamento ocorre dentro da mesma requisição HTTP síncrona (mesmo padrão do Hero hoje) — para uma imagem de até 10MB, `sharp` tipicamente processa em baixa centena de milissegundos a poucos segundos, dependendo do hardware da DigitalOcean. Como o upload já lê o arquivo inteiro em memória hoje (mesmo sem compressão, `route.ts:139`), o custo INCREMENTAL de adicionar `sharp` é o tempo de decode+encode, não um novo padrão de uso de memória. **Risco já identificado na Fase 118**: não há fila/worker dedicado para processamento de imagem — picos de upload simultâneo consomem CPU do mesmo processo que atende todas as organizações. Isso já é verdade hoje para o gerador de anúncios (`anuncio-imovel-render.ts`) e para o Hero; estender para `imoveis` aumenta a frequência desse uso, não introduz um padrão novo de risco.
- **Custo financeiro na DigitalOcean**: não há cobrança adicional por "uso de CPU dentro do mesmo contêiner" além do que já se paga pelo tier contratado (ver `docs/comercial/planos/fase-118/02-CUSTOS-INFRAESTRUTURA.md`) — o risco é de desempenho/latência sob pico, não de custo direto adicional, a menos que o volume force upgrade de tier.

## Alternativa C — Estratégia híbrida (navegador + validação/processamento no servidor)

Compressão leve no navegador (reduz tempo de upload em conexões lentas) **combinada com** a mesma validação e reprocessamento obrigatório no servidor da Alternativa B (nunca confiar que o cliente de fato comprimiu).

- **Vantagens**: soma os benefícios de ambas sem o risco de depender só do cliente — o servidor sempre garante o resultado final, o navegador só melhora a experiência de quem envia de uma conexão ruim.
- **Limitações**: maior complexidade de manutenção (duas camadas de processamento de imagem a manter, cada uma podendo introduzir seu próprio bug de qualidade/orientação) para um ganho adicional modesto, dado que o custo de upload "não comprimido" já é absorvido rapidamente pelo processamento no servidor (ver §Alternativa B).

## Recomendação fundamentada

**Alternativa B (compressão no servidor), reaproveitando o padrão já existente do Hero.** Justificativa:
1. É a única alternativa que garante o resultado **independente da origem do upload** — requisito relevante dado que a Fase 117 já registrou "importação em massa" como diferencial de roadmap; qualquer importação em lote futura precisaria do mesmo processamento no servidor de qualquer forma, então implementá-lo ali é reaproveitável, enquanto compressão client-side não ajudaria nesse cenário.
2. Resolve, como efeito colateral e sem esforço adicional, o achado de privacidade de EXIF/GPS (`06-SEGURANCA-IMAGENS.md`).
3. Não introduz dependência nova (zero risco de supply-chain adicional) — usa a mesma biblioteca já auditada e em produção.
4. A Alternativa A isolada seria insegura (pode ser contornada) e a Alternativa C adiciona complexidade sem ganho proporcional nas escalas de uso discutidas (nenhuma evidência de usuários com conexão tão lenta que o tempo de upload de 10MB sem compressão seja um problema relatado).

## Parâmetros técnicos recomendados para avaliação (não escolhidos definitivamente aqui — carecem de aprovação e de um teste piloto antes de fixar)

| Parâmetro | Valor de referência (do padrão já existente no Hero) | Observação |
|---|---|---|
| Largura máxima armazenada | A definir — Hero usa `HERO_LARGURA_MAXIMA_ARMAZENADA` (valor em `src/lib/hero-image-limits.ts`, não reproduzido aqui por ser específico do Hero, dimensão diferente de uma foto de imóvel em galeria) | Fotos de imóvel precisam de resolução suficiente para zoom em galeria — recomenda-se um valor maior que o do Hero, a ser definido com um teste visual real antes de fixar |
| Formato de saída | WebP | Mesma escolha do Hero — melhor compressão que JPEG/PNG para fotografia, suportado por todos os navegadores modernos, e já aceito pela allowlist de upload hoje (`image/webp` já está em `TIPOS_PERMITIDOS`) |
| Qualidade WebP | 82 (mesmo valor do Hero) como ponto de partida | Qualidade 82 é um valor comumente citado como "sem perda perceptível" para fotografia — mas não há teste visual A/B feito nesta fase; recomenda-se validar com fotos reais de imóvel antes de fixar (fotos de interior com pouca luz podem precisar de qualidade mais alta que uma foto de fachada ensolarada) |
| Correção de orientação EXIF | `.rotate()` sem argumento (aplica a orientação EXIF automaticamente) | Mesmo mecanismo do Hero — crítico para fotos de celular |
| Remoção de EXIF/GPS | Automática (efeito colateral do reencode sem `.withMetadata()`) | Resolve o risco de privacidade sem lógica adicional |
| Imagens panorâmicas | Não tratadas de forma especial hoje nem no Hero | Recomenda-se decidir se vale preservar a proporção original sem recorte (o Hero usa `resize()` sem `fit: cover`, preservando proporção — mesma lógica se aplicaria) |
| Arquivos com transparência (PNG) | WebP suporta transparência — não há perda de canal alfa ao converter PNG→WebP | Sem risco técnico identificado |

**Nenhum destes valores deve ser tratado como decidido** — ficam como ponto de partida para a Fase de implementação (`08-ROADMAP-IMPLEMENTACAO.md`), condicionados a um teste visual real antes de aplicar em produção.
