# Checklist de segurança — demonstração remota (REM-002)

Aplica-se quando (e se) a Alternativa B for aprovada e ativada. Nada disto exigiu alteração de código nesta fase — são configurações de ambiente e procedimento, não lacunas de produto.

## Autenticação

| Item | Estado no produto hoje | Ação para o ambiente remoto |
|---|---|---|
| Acesso anônimo ao painel administrativo | Não existe — todo acesso a `/app` e `/platform` exige sessão válida | Nenhuma |
| Senhas fixas em código | Não existem (bcrypt, geradas/hasheadas) | Gerar senhas únicas para as contas demo do staging, nunca reaproveitar a senha fixa impressa pelo `seed-demo.ts` em um ambiente acessível externamente |
| Credenciais versionadas | Nenhuma encontrada | Confirmar antes do primeiro commit do ambiente de staging (se vier a existir configuração versionada) |
| Divulgação de contas administrativas | Não aplicável hoje | Contas demo devem ser comunicadas só ao demonstrador/cliente autorizado, nunca em canal público |
| Permissão mínima das contas demo | `seed-demo.ts` já cria papéis variados (OWNER, ADMIN, BROKER) para a organização fictícia — nenhuma conta demo tem acesso de operador de plataforma (`PlatformOperator`) | Confirmar que nenhuma conta de operador de plataforma (`SUPER_ADMIN`) é criada/exposta no ambiente demo |
| Expiração de sessão | JWT com `maxAge` padrão do NextAuth (30 dias) | Avaliar reduzir `maxAge` especificamente no ambiente demo (ex.: algumas horas), se o staging vier a ser criado — ajuste de configuração, não de código |
| Cookies seguros em HTTPS | `secure: NODE_ENV === "production"` já cobre qualquer ambiente com `NODE_ENV=production` | Garantir que o staging rode com `NODE_ENV=production` (comportamento padrão de build do Next) |

## Multi-tenant

| Item | Estado | Ação |
|---|---|---|
| Organização demo não acessa dados de outra organização | Garantido pela extensão do Prisma Client (`TENANT_SCOPED_MODELS`), fail-closed | Nenhuma — mesmo mecanismo de produção, sem bypass |
| Endpoints validam escopo no servidor | Sim — Server Actions e Route Handlers sempre resolvem `organizationId` da sessão, nunca de input do cliente | Nenhuma |
| Troca arbitrária de organização | Não existe — `organizationMemberId`/`organizationId` vêm do token da sessão, nunca de parâmro de URL/body | Nenhuma |
| Exposição de dados de clientes reais | Não aplicável — o ambiente demo (se vier a existir) só teria a organização fictícia da Fase 115, nunca dados migrados de produção | Nunca copiar produção para o staging (reforçar no procedimento de ativação) |

## Operações externas

| Integração | Risco real identificado | Mitigação para ambiente remoto |
|---|---|---|
| E-mail (Resend) | **Real** — `src/lib/email.ts` envia e-mail de verdade em 5 fluxos quando `RESEND_API_KEY`/`RESEND_FROM_EMAIL` estão configuradas | **Não configurar essas variáveis no staging.** Comportamento de fallback (log + `enviado: false`) já existe no código, sem necessidade de alteração |
| WhatsApp | Nenhum — só gera link `wa.me` para envio manual por humano | Nenhuma ação necessária |
| Webhooks externos | Nenhum encontrado | Nenhuma ação necessária |
| Publicação de anúncio de imóvel | Nenhuma — geração de imagem local, sem postagem externa | Nenhuma ação necessária |
| Cobranças | Não existe nenhuma integração de cobrança/gateway de pagamento no produto hoje | Nenhuma ação necessária |

## Dados

- Usar exclusivamente os dados fictícios do `prisma/seed-demo.ts` (Fase 115) — já sem CPF/telefone/e-mail real de terceiros, já documentado em `docs/comercial/demo/02-inventario-cenario.md`.
- Nunca copiar/restaurar um backup de produção para o ambiente demo.

## Proteção adicional

| Item | Estado | Ação |
|---|---|---|
| Rate limiting | Existe (Upstash), mas fail-open se as variáveis não estiverem configuradas | Configurar Upstash no staging antes de abrir acesso externo — sem isso, login fica sem proteção contra força bruta |
| Proteção contra tentativas de login | Já existe (bloqueio progressivo 5min→15min→1h→24h) | Nenhuma ação adicional, depende do rate limiting acima estar ativo |
| Cabeçalhos de segurança | Já existem (CSP, HSTS, X-Frame-Options etc.), aplicados globalmente via `next.config.ts` | Nenhuma ação — herdado automaticamente por qualquer deploy do mesmo código |
| Política de cache | Não investigada em profundidade nesta fase — não é um requisito de segurança crítico para um ambiente sem dado real | Pendente, baixa prioridade |
| Logs sem dados sensíveis | Já existe (scrubbing do Sentry testado, 18 testes) | Nenhuma ação — herdado |
| Expiração de acessos | Ver "Expiração de sessão" acima | Considerar reduzir para o staging |
| Restrições de indexação por buscadores | `robots.ts`/`sitemap.ts` já bloqueiam `/app/`, `/platform/`, `/api/`; a landing institucional nova (`/sistema-imobiliario`, ver `06-landing-page.md`) já nasce com `noindex` | Garantir que o domínio do staging em si (se tiver um hostname público) tenha `robots.txt` bloqueando tudo, ou não seja divulgado/linkado de lugar nenhum |

## Mecanismos redundantes evitados

Nenhum controle novo foi implementado em código nesta fase — todos os itens acima já existem no produto (rate limiting, headers, isolamento multi-tenant, scrubbing de logs). O que falta para a Alternativa B é **configuração de ambiente** (variáveis), não produto.
