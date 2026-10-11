# Preparação operacional para o primeiro cliente real

**Fonte**: estado real do código e da documentação em `docs/operations/` nesta sessão (commit `a882f13`). Nenhum item abaixo foi marcado "Pronto" sem evidência verificável.

## C2 — Neon PostgreSQL (backup e recuperação)

| Item | Estado |
|---|---|
| Plano atual | Free (decisão deliberada do proprietário — manter durante desenvolvimento e demonstrações) |
| Restore local | **Pronto** — ciclo dump/restore/validação testado e revalidado nesta sessão (Fase 110/112), contra banco local, nunca produção |
| Janela de PITR em produção | **Pendente** — `database-restore-runbook.md` ainda marca como "A CONFIRMAR"; este relatório da Fase 113 recebeu a referência de 6 horas, mas isso precisa ser confirmado no painel Neon antes de tratar como fato operacional |
| Restore de produção | **Não validado** — nunca testado contra o banco real |

**Antes de usar dados reais de um cliente**:
1. Confirmar no painel Neon o plano, a janela de PITR e o responsável com acesso (tabela em `database-restore-runbook.md` §1).
2. Reavaliar upgrade para o plano Launch (ou equivalente) — decisão do proprietário, não executada nesta fase.
3. Avaliar necessidade de backup independente (fora do PITR da Neon), caso a janela confirmada seja insuficiente.
4. Obter autorização explícita antes de qualquer operação real de restore em produção.

**Não foi feito nesta fase**: upgrade da Neon, qualquer operação em produção.

## C3 — Suporte

| Item | Estado |
|---|---|
| Telefone oficial editável pela plataforma | **Pronto** (SUP-001, Fase 112) — `/platform/configuracoes` |
| Número de contato | +55 11 97606-9213 |
| Horário | Segunda a sexta-feira, 9h às 18h (Brasília) |
| Canal real hoje | WhatsApp comum — **não é WhatsApp Business ativo** |
| Canal definitivo de suporte ao cliente | **Pendente** — `incident-response.md` §9 lista alternativas (e-mail dedicado, WhatsApp de suporte, ferramenta de tickets), decisão ainda não tomada |
| Responsável pelo atendimento | **Pendente** |
| Procedimento de escalonamento | **Pendente** |

**Falta para operacionalizar o suporte do primeiro cliente**: decidir e registrar o canal definitivo, o responsável e o horário real de atendimento — ter o telefone configurável na plataforma NÃO torna isso resolvido por si só.

## C4 — Comissão

| Item | Estado |
|---|---|
| Capacidade técnica (cada organização usa seu próprio valor/regra) | **Pronta** — decisão arquitetural deliberada (Fase 10), confirmada suficiente na Fase 112 |
| Percentual padrão imposto pelo sistema | **Não existe, por decisão de produto** — nunca inventar um |
| Regra específica da primeira imobiliária real | **Pendente** — precisa ser confirmada com o cliente antes do primeiro fechamento real, e sua aplicação prática validada junto com ele |

## Outras verificações

| Item | Estado | Evidência/observação |
|---|---|---|
| Termos de uso | **Pendente** | Nenhuma página ou documento de termos de uso encontrado no repositório |
| Política de privacidade | **Pronto** | Página pública real por organização (`src/app/[orgSlug]/politica-de-privacidade`, Fase 51) — descreve com precisão o que o sistema realmente coleta (formulário público, IP para anti-abuso, id anônimo de analytics, favoritos locais), e deliberadamente NÃO afirma prazo de retenção, base legal específica ou DPO configurado, porque isso não existe hoje |
| Tratamento de dados pessoais (LGPD) | **Pendente** | A política de privacidade existe e é honesta sobre o que falta, mas não há avaliação jurídica formal de conformidade LGPD |
| Processo de onboarding | **Pronto** | Provisionamento self-service e via painel, convite de equipe, onboarding guiado ("Primeiros Passos") — validados com evidência de execução real (Fases 107–109) |
| Gestão de incidentes | **Pronto** (procedimento) | `incident-response.md` com classificação SEV1–SEV4, árvore de decisão, checklist de encerramento |
| Estratégia de backup | **Parcial** | Mecanismo validado localmente; confirmação específica da Neon pendente (ver C2) |
| Controle de acesso | **Pronto** | Papéis (OWNER/ADMIN/MANAGER/BROKER/ASSISTANT), autorização revalidada no servidor, isolamento multi-tenant extensivamente testado |
| Processo de cancelamento | **Não definido** | Nenhuma política de cancelamento, reembolso ou portabilidade de dados existe — precisa ser decidida antes de formalizar contrato com cliente real |
| Rotina de suporte | **Pendente** | Ver C3 |

## Síntese

**Pronto para demonstrar e prospectar**: sim, sem ressalvas técnicas.
**Pronto para operar com dados reais de um cliente pago**: **não ainda** — três pendências concretas (C2 parcial, C3, termos de uso/cancelamento) precisam de decisão humana antes de um cliente real inserir dados de produção em volume comercial.
