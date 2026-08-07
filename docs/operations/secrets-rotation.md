# Runbook — Rotação de secrets

> Nenhum valor real de secret é registrado neste documento, em nenhum
> outro arquivo do repositório, nem em log. Secret novo é gerado na hora
> da rotação e vai direto pro cofre de variáveis de ambiente da
> DigitalOcean App Platform (marcado como "encrypted"/secret na UI) — nunca
> commitado, nunca colado em issue/PR/chat.

## `AUTH_SECRET`

**O que assina.** O projeto usa Auth.js com `session: { strategy: "jwt" }`
(`src/lib/auth.config.ts`) — sessão é um JWT assinado com `AUTH_SECRET`,
guardado num cookie no navegador do usuário. Não há sessão em banco.

**⚠️ Rotacionar `AUTH_SECRET` encerra TODAS as sessões ativas
imediatamente.** Todo JWT já emitido foi assinado com o valor antigo —
assim que o valor novo entra em produção, a verificação de assinatura de
qualquer cookie existente falha, e o usuário é tratado como deslogado no
próximo request. Isso vale pra **todo mundo logado** no momento da troca,
sem exceção — não é escalonável nem parcial.

**Quando rotacionar**: suspeita de vazamento do valor atual (ex: exposto
em log, commit acidental, ex-funcionário com acesso ao painel da DO),
rotina de segurança periódica, ou exigência de compliance.

**Como rotacionar**:

1. Gerar um valor novo, forte: `openssl rand -base64 32` (mesmo comando já
   documentado no `.env.example`).
2. Avisar com antecedência combinada (ex: fora de horário de pico) — todo
   usuário logado vai precisar logar de novo.
3. Atualizar `AUTH_SECRET` nas variáveis de ambiente da DigitalOcean App
   Platform (Settings → App-Level Environment Variables, marcado como
   "Encrypted").
4. Disparar o redeploy (a troca de env var já costuma disparar rebuild
   automático na DO — confirmar no painel).
5. Validar: tentar logar após o deploy concluir; confirmar que uma sessão
   antiga (aba já aberta antes da troca) de fato desloga no próximo clique.
6. Comunicar aos usuários que precisarão logar de novo (se houver canal
   de aviso — ex: banner, e-mail).

## `DATABASE_URL` (credencial da Neon)

**O que expõe.** Acesso total de leitura/escrita ao banco de produção —
o secret de maior impacto do sistema se vazado.

**Como rotacionar** (a interface exata pode variar — confirmar no painel
Neon atual antes de agir):

1. No painel Neon: criar uma **nova role/senha** de banco (Neon permite
   trocar a senha do usuário Postgres, ou criar uma role nova com o mesmo
   nível de acesso), **sem apagar a antiga ainda**.
2. Atualizar `DATABASE_URL` na DigitalOcean com a nova credencial.
3. Redeploy.
4. Validar com `/api/admin/diagnostics` (ver `src/lib/health.ts`) —
   confirma conectividade com a credencial nova sem expor a connection
   string em lugar nenhum.
5. **Só depois de confirmar que a aplicação está saudável com a
   credencial nova**: revogar/apagar a credencial antiga no painel Neon.
   Revogar antes de validar é como se arrisca a derrubar produção sem
   fallback.

**Nunca**: trocar a senha da role atual "in place" sem ter a nova já
configurada e validada na DO primeiro — isso derruba a aplicação entre a
troca no Neon e a atualização na DO (não há uma forma "zero-downtime" de
trocar a senha de uma role já em uso sem coordenar as duas pontas).

## R2 (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`)

**O que expõe.** Acesso de leitura/escrita ao bucket de mídia (o escopo
exato depende de como o token foi criado — ver nota abaixo).

> **Nota de escopo, confirmada testando nesta fase**: o token atualmente
> configurado tem permissão de objeto (get/put/delete), mas **não** de
> administração de bucket (`GetBucketVersioning`/`GetBucketLifecycleConfiguration`
> retornam `AccessDenied` — ver `r2-restore-runbook.md`). Ao criar o
> token novo na rotação, manter esse mesmo escopo mínimo (Object
> Read & Write, não Admin Read & Write) — não expandir privilégio sem
> necessidade.

**Como rotacionar**:

1. No painel Cloudflare R2 (Manage API Tokens): criar um **token novo**
   com o mesmo escopo do atual (Object Read & Write, restrito ao bucket
   usado em produção — não "todos os buckets" se der pra restringir).
2. Atualizar `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` na
   DigitalOcean com os valores novos.
3. Redeploy.
4. Validar via `/api/admin/diagnostics` (checa `HeadBucket` de verdade —
   ver `src/lib/health.ts`) e, se possível, um upload de teste manual
   pelo painel admin da aplicação.
5. Só depois de validar: revogar o token antigo no painel Cloudflare.

## Resend (`RESEND_API_KEY`)

**O que expõe.** Capacidade de enviar e-mail em nome do domínio
verificado. **Escopo já mínimo**: a key configurada hoje é restrita a
"somente envio" (confirmado testando — `resend.domains.list()` retorna
`401 restricted_api_key` com a key atual), ou seja, mesmo vazada, não dá
pra listar/alterar domínios ou outras configurações da conta — só enviar
e-mail. Manter esse escopo ao gerar a key nova.

**Como rotacionar**:

1. No painel Resend (API Keys): criar uma key nova com o mesmo escopo
   (Sending access, não Full access).
2. Atualizar `RESEND_API_KEY` na DigitalOcean.
3. Redeploy.
4. Validar: enviar um contato de teste pelo formulário público
   (`/contato`) e confirmar que o e-mail chega — não há checagem
   automatizada de conectividade da Resend no health check (ver
   `src/lib/health.ts` — motivo documentado ali: a key é send-only,
   não existe operação de leitura barata pra "só testar conectividade"
   sem mandar e-mail de verdade).
5. Só depois de validar: revogar a key antiga no painel Resend.

## Checklist geral (qualquer secret)

- [ ] Secret novo gerado/criado **antes** de tocar em produção.
- [ ] Nunca colado em commit, PR, issue, mensagem de chat ou log.
- [ ] Atualizado nas env vars da DigitalOcean (marcado como secret/encrypted).
- [ ] Redeploy disparado e concluído.
- [ ] Validado com `/api/admin/diagnostics` e/ou teste manual do fluxo
      correspondente (login, upload, envio de e-mail).
- [ ] Secret antigo revogado **só depois** da validação acima.
- [ ] Se o secret for `AUTH_SECRET`: aviso enviado sobre encerramento de
      sessões, se houver canal pra isso.
