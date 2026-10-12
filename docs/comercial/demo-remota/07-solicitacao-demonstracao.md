# Fluxo de solicitação de demonstração (WEB-002)

## Alternativas avaliadas

| Alternativa | Custo | Implementado? |
|---|---|---|
| Botão de WhatsApp | Zero (reaproveita infraestrutura existente) | **Sim**, nesta fase |
| Formulário de contato dedicado | Baixo, mas exige nova coleta/retenção de dados a avaliar | Não — fora de escopo, risco de coleta de dado pessoal sem base legal definida |
| E-mail comercial | Zero | Não implementado como botão dedicado; o telefone de suporte já cobre o mesmo papel |
| Agendamento manual (Calendly etc.) | Possível custo de ferramenta terceira | Não avaliado — integração paga nova, fora do escopo desta fase |

## Recomendação adotada

**Solicitar demonstração → WhatsApp → Agendamento manual.** Já implementado na landing (`/sistema-imobiliario`, não divulgada — ver `06-landing-page.md`): o botão "Solicitar demonstração" e a seção de contato geram um link `wa.me` com mensagem inicial objetiva ("Olá! Gostaria de solicitar uma demonstração do Sistema Imobiliário."), usando o telefone configurado em `/platform/configuracoes` (Fase 112, SUP-001).

### Por que isto atende aos requisitos da Parte G

- **Reutiliza a configuração global existente** — nenhum número hardcoded; o link só aparece quando `PlatformSettings.supportPhone` está configurado, e desaparece (substituído por uma mensagem neutra) quando não está.
- **Gera URL segura** — `linkWhatsApp()`/`linkWhatsAppSuporte()` (já existentes, agora com um parâmetro opcional de mensagem inicial) nunca aceitam uma URL vinda de input do usuário; são sempre construídas a partir dos dígitos já validados.
- **Mensagem inicial objetiva** — texto fixo no código, sem dado pessoal do visitante.
- **Nenhuma integração com a WhatsApp Business API** — confirmado, é só um link `wa.me` para abertura manual pelo visitante.
- **Não afirma que o WhatsApp Business está ativo** — nenhum texto da landing ou da documentação faz essa afirmação; é explicitamente um número de WhatsApp comum (mesma ressalva já registrada na Fase 112 e no FAQ comercial).

## Formulário de contato — não implementado, e por quê

Um formulário dedicado exigiria decisões ainda não tomadas: minimização de dados coletados, base legal (a política de privacidade por organização já existente é por tenant, não cobre coleta em nome do próprio SaaS), retenção, proteção contra spam (o produto já tem honeypot/rate limiting para formulários do site de cada imobiliária — `src/app/[orgSlug]/contato` — mas replicar isso para um formulário do SaaS exigiria um novo fluxo, com seu próprio destino seguro de armazenamento). Por instrução explícita da Parte G, nenhuma coleta de dados pessoais foi implementada sem essa avaliação. O caminho WhatsApp evita o problema por completo: não há coleta de dado em um formulário próprio, o próprio WhatsApp do visitante é quem inicia o contato.

## Telefone de suporte oficial — estado atual

Reaproveitado sem alteração do mecanismo (Fase 112): `+55 11 97606-9213`, segunda a sexta-feira, 9h às 18h (horário de Brasília), WhatsApp comum (não é WhatsApp Business ativo — ver `docs/operations/incident-response.md`, condição C3, ainda em aberto quanto ao canal definitivo de suporte operacional).
