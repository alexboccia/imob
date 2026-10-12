# Pendências operacionais antes do primeiro cliente real

Revisão das condições C2/C3/C4 (carregadas desde a Fase 110/111) à luz desta fase — nenhuma delas foi encerrada aqui, nenhuma decisão comercial/jurídica foi tomada nesta sessão.

## C2 — Neon

- **Permanece no plano Free** — nenhum upgrade foi feito nesta fase, nem é recomendado automaticamente (ver `08-plano-ativacao.md`, onde até um staging de demonstração fica condicionado a essa decisão não ser violada).
- Janela efetiva de recuperação (PITR): continua **"A CONFIRMAR"** (`docs/operations/database-restore-runbook.md`) — não investigado novamente nesta fase, não é afetado pelo escopo da Fase 116.
- Procedimento de restore: mecanismo local já testado em fases anteriores; validação contra Neon real continua pendente.

## C3 — Suporte

- Telefone editável (Fase 112) **reaproveitado nesta fase** como canal de solicitação de demonstração (`07-solicitacao-demonstracao.md`) — nenhuma mudança no mecanismo.
- Atendimento planejado: segunda a sexta, 9h às 18h — inalterado.
- Operacionalização efetiva do canal (quem responde, SLA, escalonamento): continua **"A DEFINIR"** (`docs/operations/incident-response.md`, §9) — decisão comercial/operacional do proprietário, não técnica, fora do escopo desta fase.

## C4 — Comissão

- Configuração por imobiliária já disponível (confirmado em fases anteriores) — nenhuma alteração nesta fase.
- Regra específica continua dependendo da primeira imobiliária real — não presumida aqui.

## Jurídico e comercial

| Item | Estado | Observação |
|---|---|---|
| Termos de uso | **Não existe**, em nenhum nível (confirmado por busca nesta fase) | Não implementado — decisão jurídica fora do escopo técnico desta fase |
| Política de privacidade | Existe, mas **por organização** (`src/app/[orgSlug]/politica-de-privacidade`), não uma política do próprio SaaS | A landing institucional nova (`/sistema-imobiliario`) não tem política de privacidade própria — se vier a ser publicada, isso precisa ser resolvido antes |
| Política de cancelamento | Não encontrada | Não implementada |
| Condições de contratação | Documentadas apenas como propostas comerciais (Fase 113), não como contrato formal | Depende de validação jurídica antes de qualquer contratação real |
| Responsabilidades sobre dados | Não há um documento formal de responsabilidades (DPO, LGPD) além do que a política de privacidade por organização já descreve | Pendente de decisão/validação jurídica |
| Processo de onboarding | Existe tecnicamente (cadastro de organização, convite de equipe) — não há um roteiro comercial formal de "primeiro dia" do cliente | Mencionado na Fase 113 (`10-preparacao-operacional.md`), não revisitado aqui |

**Nenhuma conformidade jurídica é declarada por esta fase** — os itens acima continuam pendentes de validação por quem tem competência para isso (jurídico/proprietário), exatamente como em fases anteriores.
