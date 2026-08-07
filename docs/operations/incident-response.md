# Runbook — Resposta a incidentes

## 1. Como um incidente é detectado

| Sinal | Onde aparece |
|---|---|
| `GET /api/health` retornando `503` | Uptime monitor/load balancer apontado pra essa rota (ver `production-checklist.md` — configurar isso é um passo de checklist, não algo que já existe sozinho) |
| Pico de erro 500 | Alerta da Sentry (ver README, seção Observabilidade → Alertas mínimos recomendados) |
| Falha de upload | Tag `modulo:upload` na Sentry |
| Falha de banco | Tag `modulo:database` na Sentry, ou exceção `PrismaClientKnownRequestError`/`PrismaClientInitializationError` |
| Regressão após release | Alerta nativo "Regression" da Sentry, associado ao `release` (commit) |
| Relato de usuário | Canal de suporte (a definir — fora do escopo técnico deste runbook) |

## 2. Severidade — classificar antes de agir

| Nível | Critério | Exemplo |
|---|---|---|
| **SEV1 — Crítico** | Site público ou painel totalmente fora do ar; `/api/health` retornando `503` de forma sustentada; dado de um tenant vazando pra outro | Banco de dados inacessível; bug de isolamento de tenant |
| **SEV2 — Alto** | Funcionalidade importante quebrada, mas o resto do sistema funciona | Upload de mídia falhando; login falhando pra todo mundo |
| **SEV3 — Moderado** | Degradação parcial, contorno existe | Rate limiting desligado (fail-open, ver README); e-mail de contato não enviando (lead ainda é capturado no CRM) |
| **SEV4 — Baixo** | Cosmético, sem impacto funcional | Erro de CSP no console sem quebrar funcionalidade |

A severidade decide a urgência da comunicação (seção 3) e se o rollback
de emergência (seção 5) é justificável mesmo com risco de perda de dado
recente.

## 3. Primeiros passos (qualquer severidade)

1. **Confirmar o sintoma** — `curl -s https://<domínio>/api/health`
   primeiro (resposta mínima, rápida). Se der `503`, ir direto pro
   diagnóstico aprofundado:
   ```bash
   npx tsx scripts/health-check-deep.ts   # local, com env de produção exportado
   # ou GET /api/admin/diagnostics (autenticado como OWNER/ADMIN)
   ```
   Isso já aponta qual dependência falhou (`postgresql`/`r2`/`resend`)
   sem expor URL/credencial — ver `src/lib/health.ts`.
2. **Checar a Sentry** — a exceção real (mensagem, stack trace, `release`
   associado) está lá, não no health check (que é deliberadamente
   minimalista, ver README).
3. **Não agir sobre produção sozinho num incidente SEV1/SEV2** sem pelo
   menos registrar o que está prestes a fazer — mesmo numa equipe
   pequena, o registro (issue, mensagem, commit message) é o que permite
   reconstruir o que aconteceu depois.

## 4. Árvore de decisão

```
/api/health = 503?
├─ Sim → dependência crítica (postgresql) caiu
│         → checar status da Neon (painel) — é problema no provedor,
│           não na aplicação, na maioria dos casos
│         → se for corrupção/perda de dado real → database-restore-runbook.md
│
└─ Não → aplicação de pé, mas algo específico quebrado
          → Sentry aponta o módulo (tag `modulo`)
          → bug introduzido em deploy recente?
             ├─ Sim → rollback-runbook.md (checar se há migration
             │         destrutiva entre a versão boa e a atual antes
             │         de decidir)
             └─ Não → não é regressão de deploy — investigar causa raiz
                       (dependência externa: R2/Resend/Neon fora do ar,
                       ou bug pré-existente exposto por volume/dado novo)
```

## 5. Rollback de emergência

Ver `rollback-runbook.md` para o procedimento completo. Resumo da
decisão: rollback de código sozinho só é seguro se **não** houver
migration destrutiva (rename/drop) entre a versão boa e a atual — checar
antes de executar, mesmo sob pressão de SEV1. Um rollback que quebra por
schema incompatível transforma um incidente em dois.

## 6. Comunicação

- **Interno**: registrar o incidente assim que identificado — mesmo que
  seja só uma entrada num arquivo/issue com timestamp, sintoma,
  severidade e ações tomadas. Sem isso, o runbook de post-mortem (seção
  8) não tem material.
- **Usuários**: decisão de produto (canal, se existe status page) — fora
  do escopo técnico deste documento. Se o incidente for SEV1 prolongado,
  considerar aviso na própria interface (banner) se a aplicação
  conseguir renderizar algo.

## 7. Encerramento

Um incidente só é considerado encerrado quando:

- [ ] `/api/health` voltou a `200` de forma sustentada (não só um check
      isolado).
- [ ] O diagnóstico aprofundado (`/api/admin/diagnostics`) confirma as
      três dependências (`postgresql`, `r2`, `resend`) no estado
      esperado.
- [ ] Smoke test manual do fluxo afetado (login, criar imóvel, upload,
      formulário público — conforme o que foi afetado) passou.
- [ ] Sentry sem novo evento do mesmo tipo por um período razoável
      (ex: 15–30 min) após a correção.

## 8. Post-mortem (SEV1/SEV2)

Depois do incidente resolvido, registrar (formato livre, mas cobrindo):

- Linha do tempo (quando começou, quando foi detectado, quando foi
  resolvido).
- Causa raiz.
- Por que não foi pego antes (CI, teste, alerta — o que faltou).
- Ação de prevenção (novo teste, novo alerta, mudança de processo) — com
  responsável e prazo, não só "vamos melhorar isso".

## 9. Referências rápidas

| Cenário | Runbook |
|---|---|
| Banco de dados corrompido/perda de dado | `database-restore-runbook.md` |
| Mídia (R2) sobrescrita/apagada por engano | `r2-restore-runbook.md` |
| Deploy quebrou produção | `rollback-runbook.md` |
| Secret vazado | `secrets-rotation.md` |
| Deploy de rotina (não incidente) | `deployment-runbook.md` |
