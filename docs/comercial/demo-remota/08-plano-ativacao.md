# Plano de ativação — custos, dependências e autorização necessária

Este documento é o que o proprietário precisa para decidir **se e quando** ativar a Alternativa B (staging remoto). Nenhuma ação aqui foi executada.

## O que já está pronto, sem depender de aprovação (feito nesta fase)

- Arquitetura e procedimento de implantação documentados (`02-arquitetura-recomendada.md`, `03-plano-implantacao.md`).
- Checklist de segurança (`04-checklist-seguranca.md`).
- Landing institucional local, não divulgada, pronta para eventualmente ser publicada (`06-landing-page.md`).
- Fluxo de solicitação de demonstração via WhatsApp, reaproveitando a configuração existente (`07-solicitacao-demonstracao.md`).
- Ambiente local da Fase 115 preservado e já utilizável para demonstrações acompanhadas (Alternativa A) — nenhuma dependência de aprovação, pode ser usado imediatamente.

## O que depende de aprovação explícita do proprietário

| Item | Por quê depende de aprovação | Custo estimado |
|---|---|---|
| Criar um novo serviço na DigitalOcean para staging | Custo recorrente novo, recurso pago novo | **NÃO VERIFICADO** — depende do tier escolhido; a própria DO cobra por serviço "App" independente do tráfego. Faixa típica de um serviço pequeno (plano "Basic") gira em torno de alguns dólares/mês, mas o valor exato só é confirmável no painel/pricing atual da DO no momento da criação — não presumido aqui |
| Criar um projeto/branch Neon adicional | Pode exigir upgrade do plano Free se o limite de projetos for atingido — decisão explícita de não fazer upgrade da Neon está em vigor desde fases anteriores | **NÃO VERIFICADO** — depende do limite real do plano Free vigente no momento; se exigir upgrade, a decisão de não fazer upgrade da Neon PREVALECE sobre a criação do staging, ou seja, staging fica bloqueado até essa decisão ser revista |
| Instância Upstash dedicada (opcional) | Tier gratuito da Upstash provavelmente cobre o uso de um staging de baixo tráfego, mas é um recurso novo | Provavelmente R$ 0 (tier free), a confirmar no momento da criação |
| Domínio/subdomínio para o staging | Nova configuração de DNS/certificado | R$ 0 se usar o subdomínio padrão `*.ondigitalocean.app`; custo só existiria com domínio próprio, não necessário |
| Publicar a landing institucional (`/sistema-imobiliario`) de forma divulgada/indexada | Decisão comercial e de conteúdo final, não técnica | R$ 0 — já implementada, só falta decisão de divulgação |

## Testes exigidos antes de qualquer ativação

1. Confirmar, por checklist executado de fato (não só documentado), que o ambiente não envia e-mail real (`RESEND_API_KEY` ausente de propósito).
2. Confirmar rate limiting ativo (Upstash configurado) antes de abrir qualquer acesso externo.
3. Confirmar isolamento de banco (a `DATABASE_URL` do staging nunca é a de produção — conferir literalmente a string, sem assumir).
4. Rodar o seed de demonstração contra o staging e validar visualmente (mesma técnica da Fase 115) antes de convidar qualquer cliente.

## Decisão pendente

**Nenhum recurso pago foi criado nesta fase.** A ativação da Alternativa B aguarda decisão explícita do proprietário sobre: (1) se há necessidade comercial real que justifique o custo recorrente agora, dado que a Alternativa A já atende demonstrações; (2) orçamento aprovado; (3) confirmação do impacto no plano Neon antes de criar qualquer projeto/branch adicional.
