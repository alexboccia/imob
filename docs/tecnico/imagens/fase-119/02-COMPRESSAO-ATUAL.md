# 02 — Verificação de compressão atual

## Diagnóstico direto (confirmado lendo `src/app/api/admin/upload/route.ts` linha por linha)

**Fotos de imóvel (pasta `imoveis`) são armazenadas no R2 SEM NENHUM processamento — bytes idênticos ao que o navegador enviou.** A única ramificação de processamento de imagem em toda a rota de upload é:

```ts
if (pasta === "hero") {
  const processado = await processarImagemHero(bytes);
  ...
}
```

Não existe ramificação equivalente para `imoveis`, `usuarios`, `site`, `perfil` ou `materiais`. O buffer validado (`bytes = Buffer.from(await arquivo.arrayBuffer())`, linha 139) vai direto para `PutObjectCommand` nessas pastas.

## Classificação pelos três tipos definidos no briefing

### A. Compressão antes do armazenamento (reduz o arquivo no R2)
- **Hero da home institucional**: SIM — `src/lib/hero-image-processar.ts`. Decodifica com `sharp`, corrige orientação EXIF (`.rotate()`), redimensiona (`width: min(largura, HERO_LARGURA_MAXIMA_ARMAZENADA)`, `withoutEnlargement: true`), reencoda para **WebP qualidade 82**.
- **Fotos de imóvel, perfil de usuário, site, materiais**: **AUSENTE**. Armazenados exatamente como enviados, até o limite de 10MB.

### B. Otimização na entrega (reduz dados trafegados ao navegador, não o arquivo original armazenado)
- **Existe, via Next.js Image Optimization** (`next/image`, usado em `src/components/GaleriaFotos.tsx` e nos cards de imóvel) — gera variantes redimensionadas sob demanda no momento da requisição, com `sizes` definido por componente (confirmado em `GaleriaFotos.tsx:323,430,507,612`). **Isso NÃO altera o arquivo original no R2** — cada requisição de uma resolução diferente aciona o otimizador do Next novamente (sujeito ao cache do próprio Next, sem política de `Cache-Control` customizada definida em código).
- Nenhuma camada de CDN explícita adicional foi encontrada no código (não investigado se o domínio público do R2 está numa zona Cloudflare com cache de borda próprio — ver `06-SEGURANCA-IMAGENS.md`, item de infraestrutura NÃO VERIFICADO).

### C. Redimensionamento visual (só muda dimensão exibida, não necessariamente tráfego/armazenamento)
- O CSS/layout da galeria (`fill`, proporções de card) controla a apresentação visual — mas como a entrega já passa pelo otimizador do Next (categoria B), o redimensionamento visual nesse caso JÁ reduz o tráfego real, não é "só cosmético". Esta categoria, isolada do otimizador do Next, não é usada em nenhum lugar do produto hoje.

## Tamanho máximo permitido

**10 MB por foto** (`LIMITE_TAMANHO_BYTES.imagem`, `src/lib/upload-validation.ts:14`) — mesmo tamanho de hoje para qualquer imagem (imóvel, perfil, site). Vale também antes de qualquer reprocessamento (o Hero recebe até 10MB de entrada, mas a saída final é sempre menor devido ao WebP qualidade 82).

## Formatos aceitos

`image/jpeg`, `image/png`, `image/webp` (+ `application/pdf` para materiais, categoria separada). Nenhum SVG, GIF, AVIF, HEIC.

## Onde ocorre a validação

`src/lib/upload-validation.ts`, função `validarArquivo()` — chamada uma única vez, dentro da rota `/api/admin/upload`, antes de qualquer gravação.

## Armazenadas em resolução original?

**Sim, para fotos de imóvel.** Confirmado: nenhuma etapa de resize ocorre para essa pasta. A resolução/tamanho real armazenado é inteiramente determinada pelo dispositivo/app usado pelo corretor para capturar/exportar a foto, até o teto de 10MB.

## Existem miniaturas ou versões alternativas?

**Não.** Confirmado pelo schema: `model Media` tem um único campo `url` (`prisma/schema.prisma:648`), sem `thumbnailUrl` nem variante de tamanho. Qualquer versão "pequena" vista na interface é gerada em tempo real pelo `next/image` (categoria B acima), nunca armazenada como arquivo adicional.

## Remoção de metadados EXIF

- **Hero**: removida como efeito colateral do reencode via sharp (sharp não preserva EXIF por padrão ao reencodar, a menos que `.withMetadata()` seja chamado explicitamente — não é chamado aqui).
- **Fotos de imóvel**: **EXIF preservado integralmente**, incluindo, se presente no arquivo original, coordenadas de GPS do momento da captura da foto. Ver risco de privacidade em `06-SEGURANCA-IMAGENS.md`.

## Conclusão do diagnóstico (resposta direta à pergunta A do relatório final)

**Não existe compressão real antes do armazenamento no R2 para fotos de imóvel.** O único mecanismo de compressão/reencode do produto (sharp + WebP) está implementado e funcionando, mas é exclusivo da imagem de Hero institucional — nunca foi estendido para a pasta `imoveis`, que é o maior volume de uso real da plataforma.
