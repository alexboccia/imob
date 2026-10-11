# Piloto comercial — checklist executivo e termo de decisão

**Data desta preparação**: 2026-10-11
**Commit avaliado**: `2691d1c47e69dad5e6b2526566474d7470bfc1ed`
**Origem**: Fase 111, continuação direta das Fases 109 e 110 (homologação
de aceite e encerramento de pendências).

Este documento **não autoriza o piloto por si só**. Ele organiza as
evidências já comprovadas, isola o que depende de decisão humana e dá ao
responsável de produto um instrumento único para registrar a decisão
final. Nenhum campo abaixo marcado como **A DEFINIR** foi preenchido por
suposição.

---

## 1. C4 — Regra comercial de comissão

### 1.1 O que o sistema já suporta (não alterar, não inventar além disto)

O CRM **não tem conceito de percentual padrão armazenado**. Cada
negociação fechada (`PropertyInterest.stage = WON`) grava um
`commissionValue` — um **valor absoluto**, nunca uma fórmula ou
percentual persistido. O comentário do próprio código documenta a
decisão (`src/app/app/clientes/actions.ts:2282-2283`): *"não presumem
100%, 50/50 nem percentual de mercado; não persistem percentual — o '%'
da tela só calcula um valor."*

Quando a comissão é dividida entre corretores, cada participação grava
um `allocationValue` próprio, com a invariante de que a soma das
alocações nunca excede o `commissionValue` total do negócio
(`actions.ts:1869`, Fase 13). Essa mecânica já foi testada e confirmada
na Fase 109 (fechamento WON com `closedValue`/`commissionValue`
corretos, nunca confundidos entre si).

**Conclusão técnica**: não há nada a implementar ou alterar no sistema
para suportar qualquer percentual que a imobiliária piloto decida usar —
o corretor simplesmente digita o valor acordado no momento do
fechamento. A pendência é **inteiramente comercial**: qual critério a
imobiliária vai seguir ao decidir esse valor, caso a caso ou como regra
geral informal.

### 1.2 Formulário de decisão comercial

| Campo | Valor |
|---|---|
| Imobiliária piloto (identificação) | **A DEFINIR** |
| Percentual ou regra de comissão acordado (ex: "6% sobre o valor de venda", "valor fixo por locação") | **A DEFINIR** |
| Condições de aplicação (ex: varia por tipo de imóvel, por corretor, por faixa de valor) | **A DEFINIR** |
| Responsável pela aprovação | **A DEFINIR** |
| Data da aprovação | **A DEFINIR** |
| Evidência do acordo (e-mail, contrato, ata — referenciar, não colar dados sensíveis aqui) | **A DEFINIR** |

**Critério de encerramento de C4**: regra acordada e registrada nesta
tabela antes do primeiro fechamento comercial real do piloto. Se a regra
acordada exigir algo que o sistema não suporta hoje (ex: cálculo
automático por percentual persistido), isso deve ser registrado como uma
**nova condição técnica comprovada**, avaliada separadamente — nunca
implementada por suposição aqui.

---

## 2. Checklist executivo de autorização

Nenhum item abaixo foi marcado **APROVADO** sem evidência. Itens sem
evidência disponível nesta sessão permanecem **NÃO VERIFICADO**.

### 2.1 Segurança técnica

| Item | Estado | Evidência |
|---|---|---|
| Aplicação acessível | APROVADO | `GET /` → 200 (smoke de produção, Fases 109–111) |
| Health check saudável | APROVADO | `GET /api/health` → `{"status":"ok"}` |
| Jornadas essenciais homologadas | APROVADO | Fase 109 — jornada completa do piloto (ativação, 2 corretores, SALE/RENT, negociação até WON com comissão, pipeline, divulgação), evidência de execução real |
| Isolamento multi-tenant preservado | APROVADO | Fase 109 — organização nova não vê nada da primeira (teste de integração) |
| Permissões preservadas | APROVADO | Nenhuma alteração de papel/permissão em nenhuma fase 106–111 |
| Nenhum bloqueio técnico crítico conhecido | APROVADO | Nenhum achado P0/P1 de produto nas Fases 109–111 |

### 2.2 Recuperação operacional

| Item | Estado | Evidência |
|---|---|---|
| Restore local validado | APROVADO | Fase 110 — ciclo dump/restore/validação reexecutado fresco, contagens idênticas, limpeza confirmada |
| Plano Neon confirmado | **NÃO VERIFICADO** | `database-restore-runbook.md` §1 — sem acesso ao painel Neon nesta sessão (sem `neonctl`/`NEON_API_KEY` configurados) |
| Janela de PITR confirmada | **NÃO VERIFICADO** | Mesma tabela, mesmo motivo |
| Responsável pela recuperação identificado | **PENDENTE** | Campo "Responsável pela conta Neon" da tabela ainda **A CONFIRMAR** |
| Procedimento de rollback conhecido | APROVADO | `rollback-runbook.md`, testado em ambiente isolado (achado do `production-checklist.md`) |

### 2.3 Suporte

| Item | Estado | Evidência |
|---|---|---|
| Canal definido | **PENDENTE** | `incident-response.md` §9 (proposta criada nesta fase, decisão ainda não registrada) |
| Responsável definido | **PENDENTE** | Mesma seção |
| Horário definido | **PENDENTE** | Mesma seção |
| Escalonamento definido | **PENDENTE** | Mesma seção |
| Responsável pela interrupção definido | **PENDENTE** | Mesma seção |

### 2.4 Comercial

| Item | Estado | Evidência |
|---|---|---|
| Imobiliária piloto identificada | **PENDENTE** | Seção 1.2 deste documento |
| Responsável comercial definido | **PENDENTE** | Seção 1.2 deste documento |
| Regra de comissão acordada | **PENDENTE** | Seção 1.2 deste documento — mecânica já suportada, valor ainda não acordado |
| Condições comerciais aprovadas | **PENDENTE** | Depende da mesma decisão |

### 2.5 Autorização

| Item | Estado | Evidência |
|---|---|---|
| Pendências obrigatórias encerradas ou riscos explicitamente aceitos | **PENDENTE** | C2, C3, C4 ainda abertas (ver seção 3 abaixo) |
| Evidências anexadas ou referenciadas | APROVADO | Este documento + `database-restore-runbook.md` + `incident-response.md` + relatórios das Fases 109–111 |
| Responsável pela decisão identificado | **A DEFINIR** | — |
| Decisão registrada | **PENDENTE** | Seção 4 abaixo, em branco |
| Data da autorização registrada | **PENDENTE** | — |

---

## 3. Síntese das condições (C1–C5)

| ID | Condição | Estado | Prioridade | Responsável | Critério de encerramento |
|---|---|---|---|---|---|
| C1 | Restore local: dump, restauração e validação | RESOLVIDA | P2 | Engenharia | Reexecução periódica antes de cada go-live relevante |
| C2 | Plano e janela de PITR confirmados na Neon | **NÃO VERIFICADA / BLOQUEADA** (sem acesso ao painel nesta sessão) | P1 | Responsável pela conta Neon | Tabela de `database-restore-runbook.md` §1 preenchida |
| C3 | Canal de suporte da imobiliária piloto definido | **ABERTA** | P1 | Responsável de produto/operação | Tabela de `incident-response.md` §9 preenchida e aprovada |
| C4 | Percentual e regra de comissão acordados | **ABERTA** | P2 | Responsável comercial | Tabela da seção 1.2 deste documento preenchida antes do 1º fechamento real |
| C5 | Inspeção visual autenticada do WhatsApp no Analytics | NÃO VERIFICADA, não bloqueante | P3 | Quem tiver acesso autenticado à produção | Captura de tela real, autenticada |

Nenhuma condição mudou de estado nesta fase além do que está documentado
aqui — C2, C3 e C4 permanecem abertas porque dependem de pessoas com
autoridade/acesso que esta sessão não tem, exatamente como a Fase 110 já
havia identificado. O que esta fase entregou foi o **instrumento de
coleta**, não a decisão.

---

## 4. Termo de decisão — piloto comercial do Sistema Imobiliário

**(em branco — para preenchimento pelo responsável de produto)**

1. **Projeto**: Sistema Imobiliário para Corretores (CRM multi-tenant).
2. **Imobiliária piloto**: _______________________________ (A DEFINIR)
3. **Data da avaliação**: 2026-10-11
4. **Versão/commit avaliado**: `2691d1c47e69dad5e6b2526566474d7470bfc1ed`
5. **Resultado da homologação técnica**: jornadas comerciais essenciais
   validadas (Fase 109); nenhum defeito P0/P1 de produto comprovado;
   isolamento multi-tenant e permissões preservados.
6. **Condições operacionais**: restore local validado (C1); plano/PITR
   da Neon NÃO VERIFICADO (C2); canal de suporte ABERTO (C3).
7. **Condições comerciais**: regra de comissão ABERTA (C4); mecânica de
   cálculo já suportada pelo sistema.
8. **Riscos residuais**: ver seção 5 abaixo.
9. **Evidências**: este documento + `database-restore-runbook.md` +
   `incident-response.md` + relatórios das Fases 109, 110 e 111.
10. **Decisão final**: ☐ GO ☐ GO CONDICIONAL ☐ NO-GO ☐ AGUARDANDO DECISÃO
    _(não preenchido — aguarda responsável de produto)_
11. **Responsável pela aprovação**: _______________________________
12. **Data da aprovação**: _______________________________

---

## 5. Riscos residuais

| Risco | Condição associada | Severidade | Impacto se não resolvido |
|---|---|---|---|
| Tempo de recuperação desconhecido em caso de incidente real de banco | C2 | P1 | Um incidente que exija restore real não tem janela de recuperação conhecida |
| Problema relatado pelo corretor piloto sem destino claro | C3 | P1 | Atrito de suporte, possível perda de confiança no piloto |
| Divergência comercial no primeiro fechamento real | C4 | P2 | Conflito entre corretor/imobiliária sobre o valor da comissão |
| Dado impreciso no relatório de canal WhatsApp do Analytics (não confirmado visualmente) | C5 | P3 | Risco só de confirmação visual — o código já foi corrigido na MKT-008 |

---

## 6. Como usar este documento

1. Responsável pela conta Neon preenche a tabela de
   `database-restore-runbook.md` §1.
2. Responsável de produto/operação preenche a tabela de
   `incident-response.md` §9 e aprova.
3. Responsável comercial preenche a seção 1.2 deste documento.
4. Com as três tabelas preenchidas (ou com os riscos residuais
   formalmente aceitos por quem tem autoridade), o responsável de
   produto preenche a seção 4 (Termo de decisão) e assina.
5. Nenhuma etapa acima exige alteração de código.
