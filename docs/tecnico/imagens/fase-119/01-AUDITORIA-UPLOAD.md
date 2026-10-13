# 01 — Auditoria do fluxo de upload

**Método**: leitura direta dos arquivos de código (não é inferência de documentação de fases anteriores — tudo abaixo foi reconfirmado nesta fase lendo o código-fonte real). Nenhum upload de teste foi executado.

## Fluxo real (único fluxo existente — não há URL pré-assinada nem upload direto do navegador para o R2)

```
Navegador (MediaUploader.tsx, FormData com "pasta"+"arquivo"[+"propertyId"])
  → POST /api/admin/upload (src/app/api/admin/upload/route.ts)
    → auth() + requireOrganizationId()                [linhas 51-55]
    → exige R2_BUCKET_NAME/R2_PUBLIC_URL configurados  [57-66]
    → valida pasta contra allowlist PASTAS_PERMITIDAS  [80-82]
    → checa papel do usuário por pasta (PAPEIS_POR_PASTA) [84-87]
    → rate limit de upload (verificarLimiteUpload)     [89-111]
    → se propertyId informado, confirma que é desta organização [118-132]
    → validarArquivo() — ver 02-COMPRESSAO-ATUAL.md     [134]
    → SE pasta==="hero": reprocessa com sharp           [147-155]
    → gera chave {organizationId}/{pasta}/{uuid}.{ext}  [161]
    → PutObjectCommand (R2)                             [164-173]
    → logActivity (ActivityLog)                         [191-202]
  ← { url: "{R2_PUBLIC_URL}/{chave}" }

(separado, depois) Server Action do imóvel (criarImovel/atualizarImovel,
src/app/app/imoveis/actions.ts) recebe essa URL no payload do formulário e
SÓ ENTÃO grava a linha Media no banco.
```

Este é o **único** fluxo de upload de foto de imóvel no produto — não há um segundo caminho (ex.: importação em massa não existe, confirmado na Fase 117).

## Validações aplicadas (confirmado em `src/lib/upload-validation.ts`)

1. **Tamanho**: `arquivo.size > LIMITE_TAMANHO_BYTES[categoria]` → rejeita com HTTP 413. Para imagem: **10 MB** (`LIMITE_TAMANHO_BYTES.imagem = 10 * 1024 * 1024`, linha 14).
2. **MIME declarado**: precisa estar em `TIPOS_PERMITIDOS` (linhas 75-80) — só `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
3. **Extensão vs. MIME**: a extensão do nome do arquivo precisa corresponder às extensões aceitas para aquele MIME (linhas 147-154).
4. **Assinatura binária (magic bytes)**: os primeiros 16 bytes do arquivo são lidos e comparados à assinatura esperada do formato (JPEG `FF D8 FF`, PNG, WebP via container RIFF, PDF via `%PDF-`) — linhas 165-172. **Nenhuma decodificação completa da imagem ocorre nesta etapa** (ver `02-COMPRESSAO-ATUAL.md` e `06-SEGURANCA-IMAGENS.md`).
5. **Pasta de destino**: a categoria do arquivo precisa ser aceita pela pasta (`PASTAS_PERMITIDAS`, linhas 85-106) — ex.: a pasta `imoveis` só aceita categoria `imagem`.

## Quantidade máxima de arquivos

- **Não há um limite técnico de "quantos arquivos por envio em lote"** no cliente (`MediaUploader.tsx` só marca o `<input>` como `multiple`, sem cap de contagem) — cada arquivo selecionado gera uma chamada separada a `POST /api/admin/upload`.
- O controle real de quantidade é feito em dois pontos: (a) **rate limit de upload** (ver abaixo) e (b) o **limite de plano `PHOTOS_PER_PROPERTY`**, verificado pelo Server Action do imóvel no momento de salvar (não no momento do upload em si) — `verificarLimiteFotos()`, `src/lib/entitlements.ts:194-204`, chamado em `src/app/app/imoveis/actions.ts:108` (criação) e `:273` (edição).

## Upload direto ou intermediado pelo servidor

**Intermediado pelo servidor** — não existe URL pré-assinada (presigned URL). O navegador envia o arquivo completo via `FormData` para a rota Next.js, que o lê inteiro em memória (`Buffer.from(await arquivo.arrayBuffer())`, linha 139) e só então o envia ao R2 via SDK do servidor. Isso significa que todo upload consome CPU/memória do próprio processo Next.js na DigitalOcean, mesmo sem nenhum processamento de imagem (a leitura/repasse do buffer já tem esse custo).

## Tratamento de erros

Falha ao enviar para o R2 é capturada, logada (`logger.error` + `logActivity` com `action: "error"`) e retorna HTTP 500 genérico ao cliente (linhas 174-189) — não expõe detalhe interno do erro do SDK.

## Permissões e isolamento por organizationId

- `organizationId` **nunca** vem do cliente — é resolvido da sessão (`requireOrganizationId()`, linha 55) e usado tanto para o prefixo da chave R2 quanto para o `where` de qualquer consulta ao banco.
- Pastas `usuarios` e `site` exigem papel de gestão (`PAPEIS_GESTAO_USUARIOS`/`PAPEIS_GESTAO_CONFIGURACOES`); pastas `imoveis`, `materiais`, `perfil` aceitam qualquer membro ativo da organização (mesmo nível de acesso já exigido para editar o imóvel/perfil em si — ver comentário em `route.ts:23-29`).
- Se `propertyId` for informado, a rota confirma que o imóvel pertence à organização da sessão (linhas 124-132) antes de aceitar o upload associado a ele.

## Rate limiting do upload (confirmado em `src/lib/rate-limit.ts`)

- **30 uploads por usuário em 10 minutos** e **100 uploads por organização em 10 minutos** (`uploadPorUsuario`/`uploadPorOrganizacao`).
- **Fail-open**: se `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` não estiverem configuradas, `obterKvStore()` retorna `null` e o bloco de rate limit é **inteiramente pulado** (`route.ts:94-111`) — upload fica sem limite de taxa nesse cenário, só com um log de aviso, sem bloqueio algum.
