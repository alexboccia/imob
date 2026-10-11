# Diagnóstico do produto — o que o CRM realmente oferece hoje

**Data**: 2026-10-11 · **Commit avaliado**: `a882f13`
**Fonte**: inspeção direta do código/rotas/testes do repositório — nenhuma funcionalidade abaixo é "planejada" ou "em desenvolvimento" sem estar marcada como tal.

Convenção de estado:
- ✅ **Implementada e validada** — tem testes reais (unit/integração/E2E) e já passou por homologação nesta sessão de desenvolvimento.
- ⚠️ **Implementada, validação comercial pendente** — o código funciona e tem teste técnico, mas nunca foi usada por um cliente real.
- 🔶 **Parcial** — existe parte da capacidade, com limite explícito e documentado.
- ❌ **Não disponível** — não existe no produto.

## Matriz de funcionalidades

| # | Funcionalidade | Estado real | Benefício para a imobiliária | Pode demonstrar? |
|---|---|---|---|---|
| 1 | Dashboard / Central de Trabalho | ✅ | Corretor abre o sistema e já vê o que precisa da atenção dele hoje (atividades atrasadas, sem próximo passo, compromissos do dia) — sem precisar caçar informação em planilha | SIM |
| 2 | Gestão de imóveis (CRUD, fotos, características, SALE/RENT/SALE_AND_RENT) | ✅ | Catálogo único de imóveis à venda e para locação, com preço correto por finalidade, nunca "R$ 0" quando o dado falta | SIM |
| 3 | Cadastro de clientes + preferências | ✅ | Ficha única por cliente: histórico, preferências de busca, negociações — nunca duplicada | SIM |
| 4 | Gestão de corretores/usuários (convite, papéis) | ✅ | Convite seguro por link, 5 papéis (OWNER/ADMIN/MANAGER/BROKER/ASSISTANT), cada corretor só vê o que pode | SIM |
| 5 | Pipeline de negociações (`PropertyInterest`) | ✅ | Board visual por estágio (Interessado → Visita → Proposta → Ganho/Perdido), com indicador real de "está há quanto tempo parado" | SIM |
| 6 | Agenda e visitas | ✅ | Agendamento de visita vinculado à negociação real, com responsável identificado mesmo em equipe colaborativa | SIM |
| 7 | Histórico de interações | ✅ | Toda ligação/mensagem/visita registrada na linha do tempo do cliente — nada se perde quando um corretor sai de férias | SIM |
| 8 | Comissões (valor + divisão entre participantes + liquidação) | ✅ | Comissão de cada negócio registrada, dividida entre quem participou, com controle de quanto já foi pago | SIM |
| 9 | Marketing — gerador de divulgação (MKT-001/002/003) | ✅ | Corretor gera uma imagem profissional de divulgação (Feed/Story/WhatsApp) a partir de uma foto real do imóvel, em segundos, sem precisar de designer | SIM |
| 10 | Analytics (aquisição, funil, carteira, resultado financeiro, top imóveis) | ✅ | Gestor vê de onde vêm os leads, quanto cada corretor tem na carteira, e o resultado financeiro do período — sem planilha manual | SIM |
| 11 | Configurações da imobiliária (contato, identidade visual, visibilidade comercial) | ✅ | Site público e materiais usam o telefone/logo/cores reais da imobiliária | SIM |
| 12 | Administração da plataforma (multi-organização, planos, suporte) | ✅ (uso interno) | Não é vendido ao cliente — é o painel que a própria operação do SaaS usa para gerenciar contas | NÃO (não é parte da demo ao cliente) |
| 13 | Permissões e isolamento multi-tenant | ✅ | Garantia de que uma imobiliária NUNCA vê dados de outra — validado em dezenas de testes de isolamento ao longo do desenvolvimento | Mencionar, não é visual |
| 14 | Site público por imobiliária (vitrine, ficha de imóvel, formulário de contato) | ✅ | Cada imobiliária tem seu próprio site/vitrine automaticamente, sem precisar contratar outro serviço | SIM |
| 15 | Onboarding guiado ("Primeiros Passos") | ✅ | Admin novo sabe exatamente o que falta configurar, sem treinamento individual | SIM |

## O que o produto **não** tem (para não prometer por engano)

- ❌ Integração oficial com WhatsApp Business API, Instagram ou Meta Ads — a geração de divulgação produz a imagem/legenda; o envio é manual, feito pelo próprio corretor.
- ❌ Cobrança recorrente/assinatura automatizada — hoje a entrada de clientes é administrada manualmente pela equipe do SaaS.
- ❌ App mobile nativo — a interface é web responsiva, funciona no navegador do celular.
- ❌ Assinatura eletrônica de contrato, boleto automático de aluguel, portal do inquilino — recursos presentes em alguns concorrentes (ver benchmark) e ausentes aqui.
- ❌ Integração com portais de anúncio (ZAP, VivaReal, OLX) — não verificada no código, tratar como ausente até confirmação.
- ❌ IA para alterar fotos de imóveis ou gerar fotos sintéticas — decisão deliberada de produto, não limitação técnica.

## Conclusão do diagnóstico

O produto cobre de forma real e testada a jornada **completa** de uma imobiliária pequena/média: captar → cadastrar → negociar → agendar → fechar → comissionar → divulgar → acompanhar indicadores. As lacunas em relação a concorrentes maduros (portal de anúncios, boleto, assinatura eletrônica) são reais e devem ser comunicadas como "roadmap", nunca como "já incluído".
