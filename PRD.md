# PRD — Sistema Imobiliário Web

**Versão:** 0.2 (rascunho para discussão)
**Data:** 2026-08-03
**Autor:** Rascunho gerado com Claude, a validar com o time/stakeholders

**Decisões já tomadas:**
- Escopo do produto: sistema para **uma única imobiliária** (não é uma plataforma multi-tenant/SaaS). A arquitetura deve ser organizada de forma limpa e configurável (branding, textos, domínio) para que a mesma base de código possa ser **reaproveitada/replicada** como novo projeto ao vender para outras imobiliárias no futuro — mas cada instalação roda isolada, com seu próprio banco de dados e deploy. Não há necessidade de multi-tenancy real (sem isolamento lógico de múltiplos clientes num só banco) nesta fase.
- Integração com portais externos: **sim, desde o MVP**, com **5 portais** — ZAP Imóveis, OLX, VivaReal, Imovelweb e Mercado Livre (ver observação de risco na seção 7).
- Stack tecnológica: em aberto — a definir/recomendar (seção 13).
- Não há dados legados para migrar (projeto começa do zero).
- Orçamento mensal de infraestrutura/serviços: **enxuto, até ~R$300/mês** — priorizar free tiers e soluções de baixo custo.
- Prazo de lançamento do MVP: **confortável, 2-3 meses**.
- Contratos e assinatura digital: **fora do sistema** — permanece em processo externo/jurídico.
- Login de visitante no site público: **não haverá conta/login** — favoritos via cookie/local storage; alertas de novos imóveis (se implementados) apenas por e-mail informado, sem senha.
- Tamanho da equipe inicial no painel admin: **4 a 10 usuários** (corretores + gestor).
- Identidade visual (logo, cores, nome da marca): **ainda não existe — precisa ser criada** como parte do projeto.
- Domínio: **já registrado** pela imobiliária.

---

## 1. Visão Geral

Construir uma plataforma imobiliária completa composta por dois grandes blocos:

1. **Site público (vitrine)** — onde visitantes navegam, buscam e se interessam por imóveis à venda e para locação.
2. **Painel administrativo** — onde a equipe da imobiliária cadastra imóveis (com múltiplas fotos e vídeos), gerencia clientes (CRM), controla o funil comercial e registra vendas/locações concluídas.

O objetivo é ter um sistema "de ponta": rápido, bonito, fácil de usar no celular, bom para SEO (aparecer no Google), e que reduza trabalho manual da equipe (hoje provavelmente feito em planilhas, WhatsApp e portais de terceiros).

---

## 2. Objetivos e Métricas de Sucesso

| Objetivo | Métrica |
|---|---|
| Gerar leads qualificados pelo site | Nº de contatos/leads por mês, taxa de conversão visita→lead |
| Reduzir tempo de cadastro de imóveis | Tempo médio para publicar um imóvel novo |
| Centralizar relacionamento com clientes | % de leads registrados no CRM (vs. perdidos em WhatsApp/e-mail) |
| Dar visibilidade ao estoque de imóveis | Tempo médio de um imóvel "no ar" até vender/alugar |
| Melhorar SEO / tráfego orgânico | Posição no Google para buscas locais, tráfego orgânico mensal |
| Multi-dispositivo | % de acessos mobile atendidos sem fricção |

**[A DEFINIR]** Quais dessas métricas são prioritárias para o negócio? Há metas numéricas já definidas (ex: leads/mês)?

---

## 3. Personas

- **Visitante / Comprador / Locatário** — navega no site público, busca imóveis, entra em contato.
- **Proprietário** — dono de um imóvel que quer anunciar (venda ou aluguel) através da imobiliária.
- **Corretor** — cadastra imóveis, atende leads, negocia, fecha negócios.
- **Administrador / Gestor** — gerencia usuários, vê relatórios, controla todo o sistema.
- **[A DEFINIR] Recepção/Marketing** — alguém que só cuida de fotos/anúncios sem poder fechar negócio? Precisa desse papel intermediário?

---

## 4. Escopo do Produto

### 4.1 Site Público (Vitrine)

- **Listagem de imóveis** com paginação/scroll infinito.
- **Busca e filtros**: finalidade (venda/aluguel), tipo (apartamento, casa, terreno, comercial...), cidade/bairro, faixa de preço, nº de quartos/vagas/banheiros, área (m²), características (piscina, mobiliado, aceita pet, etc.).
- **Página de detalhes do imóvel**:
  - Galeria de fotos (múltiplas imagens, ordenável, com foto de capa).
  - Vídeo(s) do imóvel (upload próprio e/ou embed do YouTube/Vimeo).
  - **[A DEFINIR]** Tour virtual 360°/planta baixa interativa — é desejado?
  - Mapa de localização (Google Maps/OpenStreetMap).
  - Informações completas (área, quartos, condomínio, IPTU, características).
  - Botão de contato (WhatsApp, formulário, telefone).
  - Imóveis semelhantes/relacionados.
- **Favoritos** — visitante salva imóveis (via cookie/local storage ou conta de usuário).
- **Página "Imóveis vendidos/alugados"** — usada como prova social (mostrar que a imobiliária realmente fecha negócios), sem expor dados sensíveis do comprador.
- **Landing pages institucionais**: Quem somos, Trabalhe conosco, Anuncie seu imóvel (formulário para proprietários), Contato, Blog/conteúdo (opcional, bom para SEO).
- **SEO técnico**: URLs amigáveis, sitemap.xml, meta tags dinâmicas por imóvel, dados estruturados (schema.org RealEstateListing), performance (Core Web Vitals).
- **Responsivo mobile-first** (grande parte do tráfego imobiliário vem de mobile).
- **Compartilhamento social** (Open Graph para WhatsApp/Facebook/Instagram).
- **Sem login de visitante (confirmado)**: favoritos via cookie/local storage no navegador; alertas de novos imóveis (se implementados) apenas via e-mail informado, sem conta/senha.

### 4.2 Painel Administrativo

- **Cadastro de imóveis (CRUD completo)**:
  - Dados gerais (tipo, finalidade, endereço, valores, condomínio, IPTU).
  - Upload múltiplo de fotos (drag-and-drop, reordenação, definição de capa, compressão automática).
  - Upload de vídeos e/ou links externos (YouTube/Vimeo).
  - Características/comodidades (checklist configurável).
  - Status do imóvel: **Disponível, Reservado, Vendido, Alugado, Inativo/Rascunho**.
  - Vínculo com proprietário e com corretor responsável.
  - Histórico de alterações de preço/status.
  - **[A DEFINIR]** Documentos do imóvel (matrícula, IPTU, etc.) — precisa de área de anexos privados?
- **Cadastro de clientes / CRM**:
  - Cadastro de leads, compradores, locatários e proprietários (podem ser a mesma entidade "Pessoa" com papéis diferentes).
  - Histórico de interações (imóveis visitados, propostas feitas, mensagens).
  - Funil de vendas/kanban (Novo lead → Contato feito → Visita agendada → Proposta → Fechado/Perdido).
  - Atribuição de leads a corretores.
  - Origem do lead (site, indicação, portal, Instagram, etc.) — importante para saber o que está funcionando.
- **Gestão de vendas/locações**:
  - Registro da venda/locação concluída (valor final, data, corretor, comissão).
  - Geração de relatórios de desempenho por período/corretor/tipo de imóvel.
  - **[A DEFINIR]** Contratos: o sistema precisa gerar/gerenciar contrato de locação/venda e assinatura digital, ou isso continua fora do sistema (ex: outro software jurídico)?
- **Gestão de usuários e permissões** (ver seção 10).
- **Dashboard** com indicadores: imóveis ativos, leads no mês, vendas/locações no mês, imóveis parados há mais tempo, etc.
- **Publicação em portais externos** (ZAP Imóveis, OLX, VivaReal, Imovelweb, Mercado Livre) — **confirmado para o MVP, com os 5 portais**. Normalmente exige gerar um feed XML/CSV no padrão de cada portal (ex: formato "Grupo ZAP" cobre ZAP + VivaReal por serem do mesmo grupo) atualizado automaticamente a cada mudança de imóvel/status. **Ponto de atenção de prazo/orçamento**: 5 integrações simultâneas no MVP é um escopo grande — cada portal tem formato, regras de validação e processo de homologação próprios, e isso pode pressionar o orçamento enxuto (~R$300/mês) e o prazo de 2-3 meses. Sugiro validar durante o planejamento técnico se dá para entrar com todos os 5 já no MVP ou se faz sentido logo no início do desenvolvimento (não do lançamento) subir 2 portais (ex: ZAP+VivaReal, que compartilham formato) e os outros 3 nas semanas seguintes, sem atrasar o lançamento do site/admin em si.

### 4.3 Fora do escopo nesta v1 (sugestão inicial, a confirmar)

- Pagamentos online (reserva com sinal, aluguel recorrente).
- Assinatura eletrônica de contratos.
- App mobile nativo (o site responsivo cobre isso inicialmente).
- Portal exclusivo para proprietário acompanhar seu imóvel.
- Multi-tenancy real (múltiplas imobiliárias no mesmo banco/deploy) — **confirmado fora de escopo**. Ao vender para outra imobiliária, o caminho é clonar/reinstanciar o projeto (novo banco, novo deploy, branding próprio), não plugar um novo cliente dentro do mesmo sistema.

**[A DEFINIR]** Confirmar se as demais exclusões (app nativo, portal do proprietário) fazem sentido para a v1.

---

## 5. Requisitos Funcionais (User Stories principais)

| ID | Como... | Quero... | Para... |
|---|---|---|---|
| RF01 | Visitante | buscar imóveis por localização, preço e características | encontrar rapidamente o que procuro |
| RF02 | Visitante | ver várias fotos e vídeos de um imóvel | avaliar o imóvel sem precisar visitar pessoalmente |
| RF03 | Visitante | entrar em contato direto pelo WhatsApp/formulário | manifestar interesse rapidamente |
| RF04 | Corretor | cadastrar um imóvel com múltiplas fotos/vídeos | publicá-lo no site |
| RF05 | Corretor | atualizar o status de um imóvel para "vendido"/"alugado" | manter o site e os relatórios corretos |
| RF06 | Corretor | registrar um novo cliente/lead | acompanhar seu atendimento |
| RF07 | Corretor | ver o histórico de um cliente | dar continuidade ao atendimento |
| RF08 | Gestor | ver relatórios de vendas/locações por período | acompanhar o desempenho do negócio |
| RF09 | Gestor | gerenciar permissões de usuários | controlar o acesso ao sistema |
| RF10 | Proprietário (via site) | enviar um formulário "quero anunciar meu imóvel" | iniciar o processo de anúncio |

*(lista inicial — deve ser expandida durante o refinamento)*

---

## 6. Requisitos Não Funcionais

- **Performance**: carregamento de páginas de imóveis com imagens otimizadas (lazy loading, CDN, formatos modernos como WebP/AVIF).
- **Armazenamento de mídia**: fotos e vídeos em volume — precisa de storage em nuvem (S3, Cloudflare R2, ou similar) + CDN. Vídeos podem ser pesados: considerar upload direto vs. embed externo (YouTube não listado) para economizar custo/banda. **Dado o orçamento enxuto (~R$300/mês)**, priorizar opções com free tier generoso (ex: Cloudflare R2/Images, sem custo de egress) e considerar limitar vídeos a embed externo (YouTube não listado) em vez de upload/hospedagem própria, ao menos no MVP.
- **Segurança**: autenticação forte para o painel admin, controle de acesso por papel, proteção contra upload malicioso de arquivos.
- **LGPD**: dados de clientes (CPF, telefone, e-mail) exigem política de privacidade, consentimento e cuidado no armazenamento/exportação — obrigatório no Brasil.
- **Backup**: rotina de backup do banco de dados e da mídia.
- **Escalabilidade**: suportar crescimento do catálogo de imóveis (centenas a milhares) sem degradação de performance de busca.
- **Disponibilidade**: site público não pode cair (é canal de geração de leads); painel admin pode ter SLA mais flexível.
- **Auditoria**: log de quem alterou o quê (preço, status do imóvel) para rastreabilidade.
- **Acessibilidade**: boas práticas básicas (contraste, alt text em imagens, navegação por teclado).

---

## 7. Integrações Potenciais

| Integração | Finalidade | Prioridade |
|---|---|---|
| Google Maps / geocodificação | Localização do imóvel | Alta |
| WhatsApp (link direto ou API oficial) | Contato rápido com o corretor | Alta |
| E-mail (SMTP/transacional) | Notificações de novos leads, confirmação de formulários | Alta |
| Portais: ZAP, VivaReal, OLX, Imovelweb, Mercado Livre | Alcance adicional de anúncios | **Alta — confirmado no MVP (5 portais)** |
| Google Analytics / Meta Pixel | Métricas de marketing e remarketing | Média |
| Assinatura digital (Clicksign/DocuSign) | Contratos | **Fora de escopo — confirmado** |
| CRM/ferramentas externas (RD Station, etc.) | Se já usam algo, integrar em vez de duplicar | **[A DEFINIR]** |

---

## 8. Papéis e Permissões (sugestão inicial)

| Papel | Site público | Cadastrar imóvel | Editar/excluir qualquer imóvel | Ver todos os clientes | Gerenciar usuários | Relatórios |
|---|---|---|---|---|---|---|
| Administrador | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gestor/Gerente | — | ✅ | ✅ | ✅ | ❌ | ✅ |
| Corretor | — | ✅ | apenas os seus | apenas os seus | ❌ | dos seus |
| Visitante | ✅ | — | — | — | — | — |

**[A DEFINIR]** Corretores devem ver os clientes/imóveis uns dos outros, ou tudo é isolado por corretor?

---

## 9. Modelo de Dados (entidades de alto nível)

- **Imóvel**: tipo, finalidade, endereço, preço, área, quartos, banheiros, vagas, características, status, fotos[], vídeos[], corretor_responsável, proprietário, data_cadastro, histórico_status.
- **Pessoa** (base para Cliente/Proprietário/Lead): nome, contato, CPF/CNPJ, papéis, origem, observações.
- **Interação/Atendimento**: pessoa, imóvel, corretor, tipo (visita, ligação, mensagem), data, notas.
- **Negócio (Deal)**: imóvel, pessoa(s) envolvidas, tipo (venda/locação), valor, status do funil, data de fechamento, comissão.
- **Usuário do sistema**: nome, papel, credenciais, imóveis/clientes atribuídos.
- **Mídia**: arquivo, tipo (foto/vídeo), imóvel_relacionado, ordem, é_capa.

---

## 10. Riscos e Pontos de Atenção

- **Volume/custo de mídia**: muitos vídeos em alta resolução podem gerar custo alto de storage/CDN — definir limites (duração máxima, resolução, nº de arquivos por imóvel).
- **Duplicidade com portais**: se o imóvel já está no ZAP/OLX, manter os dados sincronizados manualmente pode gerar inconsistência — vale a pena automatizar desde já?
- **LGPD**: dados de clientes/CPF exigem cuidado redobrado — pode exigir termo de consentimento no formulário de contato.
- **Dependência de terceiros**: Google Maps, WhatsApp API, storage em nuvem — custos recorrentes a prever.

---

## 11. Roadmap Sugerido (fases)

1. **Fase 1 — MVP (alvo: 2-3 meses)**: site público com listagem/busca/detalhes de imóveis + painel admin com CRUD de imóveis (fotos/vídeos) e status (disponível/vendido/alugado) + cadastro básico de clientes + **feed de integração com ZAP e VivaReal** (mesmo grupo/formato, menor esforço relativo).
2. **Fase 1b (ainda dentro do MVP, semanas seguintes)**: integração com os 3 portais restantes — OLX, Imovelweb e Mercado Livre.
3. **Fase 2**: CRM completo (funil, histórico, atribuição de leads), relatórios/dashboard, formulário "anuncie seu imóvel".
4. **Fase 3**: e-mail marketing, alertas de novos imóveis por e-mail (sem login).
5. **Fase 4**: recursos avançados (tour virtual, app mobile, automações de WhatsApp). Contratos/assinatura digital permanecem fora de escopo (decisão confirmada).

---

## 12. Preparado para Reaproveitamento (revenda a outras imobiliárias)

Como a mesma base poderá virar um novo projeto para outro cliente, vale investir desde já em algumas práticas — sem transformar isso em multi-tenant:

- **Configuração isolada de branding**: logo, cores, nome, textos institucionais, domínio e dados de contato centralizados em um arquivo/tabela de configuração (não hardcoded no código).
- **Sem dados/regra de negócio hardcoded**: nenhuma lista de bairros, tipos de imóvel ou textos fixos específicos desta imobiliária embutidos no código — tudo cadastrável via admin ou seed configurável.
- **Scripts de setup/seed documentados**: um novo cliente deve conseguir subir uma instância nova (banco limpo + config de branding) rapidamente.
- **Credenciais de integração por instalação**: chaves de portais (ZAP/OLX/etc.), storage de mídia e mapas devem vir de variáveis de ambiente por deploy, nunca fixas no código.
- **Documentação de deploy**: passo a passo de como clonar/reinstanciar o projeto para um novo cliente (infra, domínio, variáveis de ambiente).

Isso mantém o sistema simples (sem a complexidade de multi-tenancy real), mas evita retrabalho grande na hora de vender para o próximo cliente.

---

## 13. Decisões Consolidadas e Pontos Ainda em Aberto

**Todas as grandes questões de escopo foram decididas** (ver bloco no topo do documento e detalhes acima). Pontos que ainda merecem atenção antes/durante o planejamento técnico:

1. **Sequenciamento dos 5 portais**: dado o orçamento enxuto (~R$300/mês) e prazo de 2-3 meses, definir junto com o time técnico se as 5 integrações entram todas no MVP ou em ondas (ex: ZAP+VivaReal primeiro) sem atrasar o lançamento do site/admin.
2. **Identidade visual**: como ainda não existe, precisamos incluir no cronograma uma etapa de definição de logo/paleta/nome visual antes (ou em paralelo com) o design do site — mesmo que seja uma proposta simples e objetiva, não um projeto de branding completo.
3. **Domínio existente**: confirmar qual é o domínio e onde está registrado/DNS, para planejar o deploy (apontamento de DNS, certificado SSL) dentro do prazo.
4. **Alertas de novos imóveis por e-mail**: como não haverá login, avaliar se esse recurso entra no MVP (só captura de e-mail) ou fica para fase posterior — não foi decidido explicitamente ainda.

---

*Este é um documento vivo — deve ser revisado após as respostas às perguntas acima, antes de avançarmos para arquitetura técnica e wireframes.*
