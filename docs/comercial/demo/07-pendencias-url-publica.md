# Pendências antes de qualquer URL pública comercial

**Esta fase não publica nenhuma URL nova** (instrução explícita). Este documento registra o que precisa estar resolvido antes de considerar publicar algo além do ambiente local.

## Domínio e HTTPS

- Nenhum domínio customizado está configurado em produção hoje (confirmado em comentário do próprio código — `src/proxy.ts` — e no README). O mecanismo técnico (`OrganizationDomain`, resolução por host) já existe, mas nunca foi ativado com um domínio real.
- HTTPS: gerenciado pela DigitalOcean App Platform para o domínio atual (`*.ondigitalocean.app`); um domínio customizado novo exigiria configuração própria de certificado — não investigado nesta fase por não haver domínio a configurar.

## Autenticação e acesso

- O ambiente de demonstração local usa o MESMO mecanismo de autenticação de produção (NextAuth, credentials) — nenhum atalho ou bypass foi criado.
- Se um ambiente de staging remoto vier a ser criado no futuro (Alternativa B, não implementada nesta fase), ele precisará de usuários/credenciais próprios, nunca compartilhados com produção.

## Ambiente

- Hoje só existem dois ambientes reais: desenvolvimento local e produção (DigitalOcean + Neon Free). Não existe staging.
- Criar um staging exige: novo serviço DigitalOcean (custo), possivelmente um novo projeto/branch Neon (custo e decisão de upgrade de plano), e definição de quem tem acesso — todas decisões do proprietário, não executadas nesta fase.

## Segurança

- A organização de demonstração só existe localmente — não há risco de exposição pública enquanto isso não mudar.
- Se uma organização demo vier a ser criada em produção no futuro (Alternativa C), ela precisa ser claramente rotulada (nome, slug) para nunca ser confundida com um cliente real, e seu acesso precisa ser restrito (credenciais não compartilhadas publicamente).

## Monitoramento

- Monitoramento de produção já existe e está documentado (`docs/operations/incident-response.md`, Sentry) — não investigado novamente aqui, pois não é afetado por esta fase.

## Apresentação comercial (landing page)

- **Não existe** uma landing page do próprio SaaS hoje — a rota raiz do domínio de produção serve o site público de UMA organização específica (`PUBLIC_ORG_SLUG`), não uma página "sobre o CRM". Ver proposta de estrutura em `08-recomendacoes.md`.
- Implementação de uma landing page comercial **não está autorizada automaticamente** por esta fase — requer decisão do proprietário sobre conteúdo, planos a exibir (nunca os valores da Fase 113 como se já aprovados) e se/quando publicar.

## Resumo

Nenhum destes itens bloqueia o uso do ambiente de demonstração LOCAL (já funcional, ver `03-guia-preparacao.md`). Todos bloqueiam qualquer passo em direção a uma demonstração remota ou a uma landing page pública — e todos dependem de decisão/aprovação do proprietário do produto antes de qualquer execução.
