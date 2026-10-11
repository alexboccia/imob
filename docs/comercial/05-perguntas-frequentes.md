# Perguntas frequentes (FAQ comercial)

> Respostas baseadas no estado real do produto (commit `a882f13`). Nenhuma garantia ou política abaixo foi inventada — onde a resposta depende de decisão ainda não tomada, isso está marcado explicitamente.

## Funcionalidades

**O sistema cadastra imóveis para venda e locação?**
Sim, os dois — inclusive imóveis que aceitam ambas as finalidades, com preços e informações tratados separadamente (nunca mostra preço de aluguel como se fosse de venda, ou vice-versa).

**O sistema gera a divulgação do imóvel automaticamente?**
Sim — a partir de uma foto real já cadastrada, o sistema compõe uma imagem (Instagram Feed, Instagram Story ou WhatsApp) com os dados reais do imóvel (preço, localização, características). Não usa inteligência artificial para alterar a foto.

**Tem integração com portais de anúncio (ZAP, VivaReal, etc.)?**
Não, atualmente não há essa integração.

**Posso importar meus imóveis/clientes de uma planilha?**
Não há importação em massa disponível hoje — o cadastro é feito manualmente pela interface.

## Segurança

**Meus dados ficam misturados com os de outras imobiliárias?**
Não — cada imobiliária é isolada das demais por arquitetura (multi-tenant), validado extensivamente em testes automatizados ao longo do desenvolvimento.

**Quem pode ver os dados da minha imobiliária?**
Só usuários convidados pela própria imobiliária, com o papel (permissão) que o administrador definir.

## Usuários

**Quantos usuários posso ter?**
Depende do plano contratado — ver proposta comercial (`03-proposta-comercial.md`).

**Existem diferentes níveis de permissão?**
Sim — cinco papéis: proprietário (OWNER), administrador (ADMIN), gestor (MANAGER), corretor (BROKER) e assistente (ASSISTANT), cada um com acesso adequado à sua função.

## Imóveis

**Há limite de imóveis cadastrados?**
Depende do plano — a definir na proposta comercial final.

## Comissões

**O sistema calcula a comissão automaticamente com um percentual fixo?**
Não — o valor da comissão é informado pelo corretor/gestor no momento do fechamento de cada negócio, porque cada imobiliária tem sua própria regra (e pode variar por negócio). O sistema não impõe nem assume um percentual padrão.

**Posso dividir a comissão entre mais de um corretor?**
Sim — o sistema permite registrar a participação de cada pessoa envolvida no negócio e controlar o que já foi pago a cada uma.

## Suporte

**Qual o canal de suporte?**
**Em definição.** No momento desta documentação, existe um contato de WhatsApp comum (+55 11 97606-9213, segunda a sexta, 9h às 18h, horário de Brasília) — não é WhatsApp Business ativo, e o canal definitivo de suporte para clientes ainda depende de decisão operacional (ver `10-preparacao-operacional.md`, condição C3).

**Qual o horário de atendimento?**
Horário de referência atual: segunda a sexta-feira, 9h às 18h (Brasília). Não há atendimento fora desse horário.

## Implantação

**Quanto tempo leva para começar a usar?**
A criação da organização e o convite da equipe são rápidos (minutos); o tempo até o uso operacional completo depende de quanto dado a imobiliária já tem para migrar — isso ainda não foi medido com um cliente real.

## Preços

**Quanto custa?**
Ver proposta comercial individual — os valores sugeridos ainda dependem de aprovação final do responsável pelo produto (ver `07-precificacao.md`).

**Existe período de teste gratuito?**
Depende da estratégia comercial para o primeiro piloto — ver `08-estrategia-primeira-imobiliaria.md`. Não há uma política pública definida ainda.

## Cancelamento

**Como funciona o cancelamento?**
**Não definido ainda.** Não há política de cancelamento, reembolso ou portabilidade de dados formalizada no momento desta documentação — isso precisa ser decidido e documentado antes de formalizar qualquer contrato com cliente real.
