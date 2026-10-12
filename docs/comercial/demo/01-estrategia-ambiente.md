# Estratégia do ambiente de demonstração

**Data**: 2026-10-12 · **Commit avaliado**: `2abd35d` (Fase 114, baseline desta fase)

## Auditoria da infraestrutura atual

Fonte: `docs/operations/*` (já produzido e validado em fases anteriores — não reauditado do zero aqui, apenas referenciado) + inspeção direta do código desta fase. Nenhuma credencial, connection string ou token é citado abaixo.

| Componente | Existe? | Estado | Risco | Ação recomendada |
|---|---|---|---|---|
| Projeto DigitalOcean (produção) | SIM | Único ambiente de produção, App Platform | Baixo | Nenhuma — não tocado nesta fase |
| Banco PostgreSQL (Neon) | SIM | Plano Free, por decisão deliberada do proprietário | Médio (ver `docs/operations/database-restore-runbook.md`, janela de PITR ainda "A CONFIRMAR") | Não fazer upgrade nesta fase (confirmado: não feito) |
| Variáveis de ambiente | SIM | Documentadas em `docs/operations/production-checklist.md`, nenhuma exposta aqui | Baixo | Nenhuma |
| Autenticação | SIM | NextAuth, credentials, já auditado extensivamente em fases anteriores | Baixo | Nenhuma |
| Domínios customizados | SIM (mecanismo), NENHUM configurado | `OrganizationDomain`/`resolverTenantPorHost` (Fase P.10) existe, mas nenhum domínio customizado real está ativo em produção hoje (confirmado em comentário do próprio código, `src/proxy.ts`) | Baixo | Nenhuma — fora do escopo desta fase |
| Processo de deploy | SIM | `docs/operations/deployment-runbook.md` | Baixo | Nenhuma |
| Estratégia de seed | PARCIAL | `prisma/seed.ts` (bootstrap de catálogo, zero dado de demonstração) + `prisma/seed-e2e.ts` (fixtures de teste automatizado, não apresentável) | — | **Lacuna real, corrigida nesta fase** — ver `prisma/seed-demo.ts` |
| Estrutura multi-tenant | SIM | Isolamento por `organizationId`, extensivamente testado em todo o projeto | Baixo | Nenhuma |
| Organização de demonstração já existente | NÃO | Nenhuma organização rotulada como "demo" existia antes desta fase | — | **Criada nesta fase** (local apenas) |
| Landing page comercial do próprio SaaS | NÃO | Não existe — ver `07-pendencias-url-publica.md` | Médio (confunde visitante do domínio raiz com o site de uma imobiliária específica) | Documentado como proposta, não implementado (fora do escopo autorizado desta fase) |

## Comparação das três alternativas

| | A — Local | B — Staging dedicado | C — Organização demo em produção |
|---|---|---|---|
| Exposição pública | Nenhuma | Depende de autenticação/rede | Exposta junto com dados reais de outras imobiliárias |
| Custo | Zero (infra já existente localmente) | Novo serviço DigitalOcean + possível novo banco Neon | Zero infra nova, mas risco de contaminar produção |
| Controle dos dados | Total — banco local isolado | Total, mas infra adicional a manter | Parcial — mesmo banco/Neon Free de produção |
| Conveniência para demo remota | Baixa (depende da máquina do demonstrador) | Alta | Alta |
| Risco operacional | Nenhum | Baixo, mas exige provisionamento | Alto — qualquer erro de escopo afeta produção real |
| Já existe? | SIM (`npm run dev` + Postgres local, já usado o tempo todo nesta sessão) | NÃO | NÃO (nenhuma organização "demo" rotulada existia em produção antes desta fase) |

## Decisão técnica

**Alternativa A — ambiente local — recomendada e implementada nesta fase.**

Justificativa:
1. É a única alternativa com **custo zero** e **risco zero** de exposição ou contaminação de produção — requisito explícito da fase ("Neon permanece no plano Free", "não provisionar recursos pagos").
2. A infraestrutura já existe e já é usada por todo o desenvolvimento (Postgres local via Docker, `npm run dev`) — não duplica nada.
3. O produto ainda não tem cliente comercial ativo — não há urgência que justifique o custo/risco de um staging remoto ainda.

**Staging remoto (Alternativa B)** fica registrado como recomendação futura quando houver necessidade real de demonstrações remotas recorrentes sem depender da máquina do demonstrador (ver `08-recomendacoes.md`) — não provisionado nesta fase, por exigir infraestrutura paga e aprovação explícita do proprietário.

**Organização demo em produção (Alternativa C)** foi avaliada e **rejeitada** para esta fase: mesmo com isolamento por `organizationId`, colocar dados fictícios (ainda que claramente rotulados) na mesma instância Neon Free que eventualmente receberá o primeiro cliente real aumenta a superfície de risco operacional sem necessidade comprovada — o ambiente local já resolve o objetivo desta fase (demonstração local/presencial ou por compartilhamento de tela).

## O que foi efetivamente feito

- Reaproveitado o ambiente de desenvolvimento local já existente (`DATABASE_URL` apontando para `localhost:5432`, mesmo Postgres usado por todo o projeto).
- Criado `prisma/seed-demo.ts`, um script de seed **adicional e independente** de `prisma/seed.ts` (bootstrap de catálogo) e `prisma/seed-e2e.ts` (fixtures de teste automatizado) — nenhum dos dois foi alterado.
- Nenhuma infraestrutura nova, nenhum banco novo, nenhum serviço pago, nenhuma URL pública criada.
