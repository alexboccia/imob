# 08 — Smoke tests de produção

Executados contra `https://imob-f4vb3.ondigitalocean.app` depois da confirmação de CI verde e de um intervalo compatível com o build+deploy da DigitalOcean. Apenas endpoints públicos e leituras — **nenhum dado real foi criado, alterado ou excluído**; nenhuma organização/imóvel/cliente de teste foi criada em produção.

| Verificação | Resultado |
|---|---|
| `GET /api/health` | `{"status":"ok"}` |
| `GET /` (landing/home comercial) | HTTP 200 |
| `GET /imoveis` (listagem pública) | HTTP 200, com imóveis reais listados |
| `GET /imoveis/{id}` (ficha/galeria de um imóvel real) | HTTP 200 — galeria renderiza, sem regressão visível |
| `GET /app/login` | HTTP 200 (página carrega; nenhuma tentativa de login real foi feita) |
| `GET /platform/login` | HTTP 200 |
| `GET /platform/storage-cleanup` (rota da Etapa 120-D/E, **não publicada** nesta rodada) | HTTP 307 → `/platform/login` — **idêntico** ao comportamento de uma rota `/platform/` qualquer que não existe (confirmado com um controle: `GET /platform/rota-que-nao-existe-de-verdade` também retorna 307 → mesmo destino). Confirma que a exclusão foi efetiva: nenhuma rota nova de limpeza de storage foi exposta publicamente, nem mesmo como "página que existe mas exige login" — o middleware trata como qualquer caminho inexistente |
| `GET /robots.txt` | HTTP 200 |
| `GET /politica-de-privacidade` | HTTP 200 |

## Compressão WebP / ausência de EXIF/GPS em produção

**Não testado em produção nesta rodada** — a funcionalidade está deliberadamente desligada (`PROPERTY_IMAGE_COMPRESSION_ENABLED` ausente), então não há upload real para verificar em produção. O comportamento foi validado exaustivamente em ambiente local/automatizado (`02-AUDITORIA-COMPRESSAO.md`), nunca contra produção, e só poderá ser smoke-testado em produção depois que o gate for ativado (com a validação visual já concluída antes disso).

## Isolamento entre organizações

Não testado com uma nova mutação em produção (nenhum dado real foi criado para este fim, conforme instrução explícita de não usar exclusões/criações reais como smoke test). A garantia de isolamento foi validada exaustivamente em ambiente automatizado (`01-AUDITORIA-SEGURANCA.md`), que é onde esse tipo de verificação deve ocorrer — nunca contra dados reais de clientes em produção.

## Painel administrativo

`/platform/login` carrega normalmente (HTTP 200). Acesso autenticado não foi exercido nesta rodada (sem necessidade de criar/usar credencial real para confirmar que a página de login está no ar).

## Conclusão

Nenhum erro de aplicação observado nas rotas verificadas. Nenhuma regressão visível em funcionalidade pré-existente (site público, galeria, login). A exclusão das Etapas 120-D/E foi confirmada como efetiva em produção.
