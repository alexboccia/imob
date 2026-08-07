# Runbook — Recuperação de objetos (Cloudflare R2)

## 1. Versionamento e lifecycle — testado nesta fase, resultado inconclusivo (precisa confirmar no painel)

Tentei verificar programaticamente, via API S3-compatible da R2, usando
as credenciais reais já configuradas no `.env` do projeto:

```ts
GetBucketVersioningCommand({ Bucket: bucket })            // → AccessDenied
GetBucketLifecycleConfigurationCommand({ Bucket: bucket }) // → AccessDenied
ListObjectVersionsCommand({ Bucket: bucket, Prefix: ... }) // → NotImplemented ("ListObjectVersions not implemented")
```

**O que isso significa, com precisão** (pra não confundir "não consegui
verificar" com "está desabilitado"):

- `AccessDenied` nas duas primeiras chamadas: o token R2 configurado
  (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) tem permissão de
  leitura/escrita de **objeto**, não de **administração do bucket**
  (versionamento e lifecycle são configuração de bucket). Isso é o
  esperado/correto pro token que a aplicação usa em produção — dar
  permissão de admin de bucket pro token da aplicação seria expandir
  privilégio sem necessidade real.
- `NotImplemented` no `ListObjectVersions`: **esse não é um problema de
  permissão** — é a própria API S3-compatible da R2 dizendo que essa
  operação não existe nela, independente do token usado.
- **Conclusão**: não dá pra confirmar programaticamente, com o acesso
  disponível nesta sessão, se o versionamento de objeto está
  habilitado no bucket. **Precisa ser confirmado direto no painel
  Cloudflare R2** (Bucket → Settings) por alguém com acesso
  administrativo à conta Cloudflare.

Preencher após confirmar no painel:

| Campo | Valor | Confirmado por | Data |
|---|---|---|---|
| Versionamento de objeto habilitado? | **A CONFIRMAR** | | |
| Lifecycle rules configuradas (expiração, transição)? | **A CONFIRMAR** | | |
| Se sim, regras (prefixo, dias, ação) | **A CONFIRMAR** | | |

## 2. O que FOI testado com sucesso (ciclo básico de objeto)

Com o mesmo token, o ciclo padrão de objeto funciona sem restrição —
testado com um objeto de propósito, num prefixo isolado, apagado logo em
seguida:

```
HeadBucket                              → OK (credenciais + bucket acessíveis)
PutObject  _ops-test/health-check-...   → OK
GetObject  (mesma chave)                → OK, tamanho conferido
DeleteObject (limpeza)                  → OK
```

Isso confirma que a aplicação consegue gravar/ler/remover objeto
normalmente — é exatamente o que `checarR2()` (`src/lib/health.ts`) usa
pro diagnóstico protegido (só o `HeadBucket`, mais barato que um ciclo
completo).

## 3. Se o versionamento estiver ativo — como recuperar um objeto

Quando a tabela da seção 1 confirmar versionamento ativo, o procedimento
de recuperação (a testar num objeto de propósito, nunca em mídia real de
imóvel/usuário, quando o recurso estiver confirmado):

1. No painel Cloudflare R2, abrir o objeto afetado — a interface lista
   versões anteriores quando o bucket tem versionamento habilitado
   (nome exato da aba/opção a confirmar na versão atual do painel, já que
   a API S3-compatible não implementa `ListObjectVersions` — listar
   versão só é possível pelo painel ou pela API nativa da Cloudflare, não
   pela API S3-compatible usada pela aplicação).
2. Restaurar a versão anterior desejada (baixar e re-subir como versão
   atual, ou usar a opção de restore do painel, se existir).
3. Validar o objeto restaurado (abrir a URL pública, conferir que
   corresponde à mídia esperada) **antes** de considerar o incidente
   resolvido.

**Se o versionamento NÃO estiver ativo** (ou a confirmação da seção 1
mostrar que não está): não existe recuperação automática de um objeto
sobrescrito/apagado — a única defesa é a mídia continuar existindo em
outro lugar (ex: o `Property.media` no banco guarda a URL, mas não uma
cópia do arquivo). Nesse cenário, ativar versionamento é uma melhoria
recomendada (ver seção 4), não algo que já protege hoje.

## 4. Proposta de ativação — não aplicada automaticamente

Conforme instrução: **nenhuma mudança de configuração no console R2 foi
aplicada nesta fase.** Proposta, pra quem tem acesso decidir:

- **Versionamento de objeto**: habilitar no bucket usado por produção.
  Custo: armazenamento de versões antigas até serem expiradas por
  lifecycle rule (ver abaixo) — sem lifecycle, versões antigas acumulam
  indefinidamente.
- **Lifecycle rule sugerida** (a criar só depois de decidir ativar
  versionamento): expirar versões não-atuais de objeto após N dias (ex:
  30) — equilibra "consigo recuperar um erro recente" com "não pago
  armazenamento de versão pra sempre". Valor exato de N é decisão de
  produto/custo, não técnica.
- Objetos ficam em `{organizationId}/properties/{propertyId}/...` (ver
  README) — uma lifecycle rule poderia também ser escopada por prefixo se
  algum tipo de mídia precisar de retenção diferente, mas isso não é
  necessário pra ativação inicial.

## 5. Checklist rápido de execução

- [ ] Confirmei o estado real de versionamento/lifecycle no painel
      (seção 1) antes de assumir qualquer coisa.
- [ ] Se for recuperar objeto de verdade: testei o procedimento com um
      objeto de propósito primeiro, nunca direto em mídia real.
- [ ] Validei o objeto recuperado (URL pública abre, conteúdo correto)
      antes de fechar o incidente.
- [ ] Se o versionamento não estava ativo e o incidente expôs essa
      lacuna: registrei a recomendação da seção 4 pra decisão de produto.
