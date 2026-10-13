# 07 — Commit, push e deploy

## Commit

- **Branch**: `main`. **Remote**: `origin` → `https://github.com/alexboccia/imob.git`.
- **Commit**: `b9f1095` — `feat(storage): secure property images and add consistent R2 cleanup on edit`.
- **Arquivos incluídos**: 55 (ver `06-CORRECOES-REALIZADAS.md` e o diff do commit) — exatamente o escopo reduzido (120-A, 120-B desligada, 120-C) + documentação técnica das Fases 119/120/120-implementação/120-deploy.
- **Arquivos explicitamente excluídos** (confirmados fora do commit por `git status` antes e depois): `prisma/schema.prisma`, a migration `20261013011821_add_platform_storage_cleanup_task`, `src/app/platform/storage-cleanup/`, `src/lib/{storage-cleanup,legacy-reprocess,orphan-inventory}.ts` (+testes), `tests/integration/{storage-cleanup,legacy-e-orfaos}.test.ts`, `docs/comercial/planos/` (fora do escopo desta fase).
- **Drift pré-existente preservado**: `src/app/layout.tsx` e `public/demo-fotos/` permanecem fora do commit, exatamente como estavam antes desta sessão.
- Nenhum segredo, arquivo temporário, fotografia real de teste ou dado pessoal foi incluído — confirmado por revisão do diff antes do commit.

## Push

```
git push origin main
```
Resultado: `42b95dd..b9f1095  main -> main` — sem erro, sem necessidade de force push.

## CI

- Run `38343662594`, `headSha` confirmado igual a `b9f10955da4a622dfe6fbd22bae207ae4588ef2c`.
- `conclusion: success`.

## Deploy (DigitalOcean App Platform)

- **Gatilho**: automático, via integração nativa GitHub↔DigitalOcean no push a `main` (confirmado em `docs/operations/deployment-runbook.md` — sem passo manual).
- **Migration**: nenhuma nesta publicação (schema inalterado) — o Job de pre-deploy `imob2` roda `prisma migrate deploy`, que não encontra nada pendente (nenhuma migration nova foi incluída no commit).
- **Confirmação de que o deploy foi concluído**: verificado via smoke test funcional pós-deploy (`08-SMOKE-TESTS-PRODUCAO.md`), já que esta sessão não tem acesso ao painel/API da DigitalOcean (`doctl` não disponível, confirmado nesta auditoria) para consultar o status do deployment diretamente. O tempo entre o push e o smoke test (aprox. 15-20 minutos, incluindo o tempo de build+deploy da própria DO) é consistente com o padrão já observado em fases anteriores deste projeto.

## Variáveis de ambiente

Nenhuma variável nova é necessária para o funcionamento desta publicação. `PROPERTY_IMAGE_COMPRESSION_ENABLED` **não foi definida** em produção (deliberado — mantém a compressão desligada). Nenhuma credencial foi exposta neste relatório.
