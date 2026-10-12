# Estratégia de demonstração remota — comparação e decisão

## Alternativa A — Compartilhamento de tela (ambiente local da Fase 115)

- **Custo**: zero.
- **Infra nova**: nenhuma.
- **Segurança**: superfície de exposição mínima — nada sai da máquina do demonstrador.
- **Limitação**: o cliente não navega sozinho; depende da agenda do demonstrador.
- **Prontidão**: **já pronta hoje** — reaproveita integralmente o ambiente e o roteiro validados na Fase 115 (`docs/comercial/demo/`).

## Alternativa B — Staging isolado (remoto, app + banco próprios)

- **Custo**: recorrente — no mínimo um serviço adicional na DigitalOcean (ou equivalente) e, com alta probabilidade, um projeto/branch Neon adicional (o plano Free da Neon tem limite de projetos; mesmo que caiba, misturar demo e produção no mesmo projeto Neon não é recomendável — ver `04-checklist-seguranca.md`).
- **Infra nova**: app própria, banco próprio, variáveis de ambiente próprias (nunca compartilhadas com produção), domínio/subdomínio próprio.
- **Segurança**: exige todos os controles do REM-002 (autenticação obrigatória, bloqueio de e-mail real, rate limiting ativo, monitoramento) — maior superfície, mas isolada de produção por completo.
- **Vantagem**: o cliente navega sozinho, em um ambiente com URL real, sem depender da disponibilidade do demonstrador.
- **Prontidão**: arquitetura e procedimento documentados nesta fase (`03-plano-implantacao.md`), **nada foi provisionado** — depende de aprovação explícita do proprietário antes de criar qualquer recurso pago.

## Alternativa C — Organização demonstrativa na infraestrutura de produção existente

**Não recomendada nesta fase.** Motivos concretos, não apenas teóricos:

1. **Isolamento lógico não é isolamento de ambiente.** O isolamento por `organizationId` (extensão do Prisma Client, `src/lib/prisma.ts`) garante que uma organização não lê dado de outra — mas uma organização demo em produção continua compartilhando o MESMO banco, o MESMO processo, e, criticamente, as MESMAS credenciais de serviços externos.
2. **Risco concreto de e-mail real**: `src/lib/email.ts` dispara e-mails reais via Resend em 5 fluxos (contato, convites, recuperação de senha, cadastro). Uma organização demo em produção usaria as mesmas `RESEND_API_KEY`/`RESEND_FROM_EMAIL` de produção — qualquer teste de "esqueci minha senha" ou "convidar membro" durante uma demonstração enviaria um e-mail de verdade para o endereço digitado (inclusive se for o próprio e-mail do cliente potencial, o que é aceitável, mas se for um e-mail de teste inventado, pode cair em caixa de terceiro ou gerar bounce real monitorado por Sentry/Resend).
3. **Risco de contaminação de métricas/analytics de produção** (contadores de uso, eventos de analytics por organização) e de auditoria (`PlatformAuditLog`) — não é um risco de vazamento de dado entre tenants, mas de poluição operacional do ambiente real.
4. **Não há necessidade real hoje** — a Alternativa A já atende o estágio atual (pré-primeiro-cliente, demonstrações acompanhadas), e a Alternativa B atende a necessidade futura de acesso self-service sem herdar nenhum desses riscos.

**Esta fase não executa seed demonstrativo em produção**, por instrução explícita e pelos motivos acima.

## Critérios de comparação

| Critério | A — Tela compartilhada | B — Staging isolado | C — Org demo em produção |
|---|---|---|---|
| Segurança | Alta (nada exposto) | Alta (com os controles do REM-002) | Baixa (compartilha credenciais externas reais) |
| Custo mensal | R$ 0 | A estimar (DO + possível Neon adicional) — ver `08-plano-ativacao.md` | R$ 0 adicional, mas risco operacional |
| Complexidade | Nenhuma | Média (novo serviço, novas variáveis, novo procedimento de deploy) | Baixa técnica, alta de risco |
| Manutenção | Nenhuma | Recorrente (atualizar, monitorar, desativar quando ocioso) | N/A (não recomendada) |
| Conveniência comercial | Média (depende do demonstrador) | Alta (cliente navega sozinho) | N/A (não recomendada) |
| Acesso temporário | Não aplicável | Possível (Modelo 2/3, ver `05-acesso-demonstrativo.md`) | N/A (não recomendada) |
| Recuperação de dados | Não aplicável (nada remoto) | Seed idempotente já existente, reset simples | N/A (não recomendada) |
| Serviços adicionais | Nenhum | Upstash (rate limit), Sentry (monitoramento), possivelmente Resend bloqueado de propósito | N/A (não recomendada) |

## Recomendação

**Para o estágio atual do produto (pré-primeiro-cliente real): Alternativa A.** Zero custo, zero infraestrutura nova, zero risco de exposição, e já está pronta — basta usar o ambiente e o roteiro da Fase 115.

**A Alternativa B fica preparada (arquitetura, checklist, custos) para quando houver necessidade comercial real de demonstração remota self-service** — por exemplo, se um cliente em potencial pedir explicitamente para navegar sozinho antes de uma reunião. Ativá-la depende de: (1) aprovação do proprietário, porque envolve custo recorrente e criação de recursos externos; (2) confirmação do plano Neon efetivo (não presumir que o Free plan atual suporta um segundo projeto sem custo); (3) execução do checklist de segurança (`04-checklist-seguranca.md`) antes de qualquer acesso externo real.

**Veredito desta fase**: preparação concluída, nenhuma ativação remota executada — ver `R. Veredito` no relatório final.
