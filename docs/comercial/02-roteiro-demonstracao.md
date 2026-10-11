# Roteiro de demonstração comercial (15–20 minutos)

**Jornada**: Imobiliária → Imóvel → Cliente → Negociação → Atividade → Comissão → Indicadores.
**Público**: dono(a) ou gestor(a) de imobiliária — linguagem de negócio, não técnica.
**Pré-requisito**: ambiente de demonstração com dados fictícios claramente identificados (ver seção final). Nunca demonstrar em produção com dado real de terceiro.

| # | Tempo | Tela | Ação do demonstrador | Benefício comercial | Mensagem a transmitir |
|---|---|---|---|---|---|
| 1 | 0:00–1:30 | Login + Dashboard | Logar como OWNER, mostrar o Dashboard carregando | Visão geral do dia sem precisar abrir planilha nenhuma | "Isso aqui é a primeira tela que qualquer pessoa da sua equipe vê ao entrar." |
| 2 | 1:30–3:30 | Central de Trabalho | Apontar os blocos "Hoje", "Próximos", "Negociações" | Corretor sabe exatamente o que fazer agora, sem depender de lembrar | "Nada aqui é inventado — é tudo baseado em compromissos e negociações reais que vocês já têm." |
| 3 | 3:30–6:00 | Imóveis → ficha de um imóvel | Mostrar listagem, abrir um imóvel, destacar fotos, preço, características | Catálogo único, sem imóvel "perdido" em outro arquivo | "Cada imóvel tem uma ficha completa — e o sistema nunca mostra '0 quartos' quando a informação simplesmente não foi preenchida." |
| 4 | 6:00–8:00 | Clientes → ficha de um cliente | Abrir cliente, mostrar preferências, histórico de interações | Nenhum contato se perde quando o corretor sai de férias ou troca de emprego | "A ficha do cliente é da imobiliária, não do corretor." |
| 5 | 8:00–10:30 | Pipeline | Mostrar o board, abrir uma negociação, apontar o indicador de tempo na etapa | Gestor vê rapidamente o que está travado, sem perguntar pessoalmente pra cada corretor | "Esse número aqui não é 'dias desde a última edição' — é o tempo real que a negociação está NESSA etapa." |
| 6 | 10:30–12:30 | Agenda | Mostrar visita agendada vinculada à negociação, apontar responsável | Nada de "quem marcou essa visita?" — sempre sabe de quem é o compromisso | "Mesmo com equipe grande e colaborativa, o sistema sempre sabe de quem é cada compromisso." |
| 7 | 12:30–15:30 | Gerador de divulgação ("Criar divulgação") | Abrir a tela, escolher uma foto real, escolher formato (Feed/Story/WhatsApp), gerar prévia | Material de divulgação profissional sem contratar designer | "Isso aqui normalmente é terceirizado ou leva meia hora no Canva. Aqui são segundos, com os dados reais do imóvel." |
| 8 | 15:30–17:30 | Fechamento + Comissão | Mostrar (com dado fictício) uma negociação fechada como "Ganho", valor e comissão registrados | Controle financeiro sem planilha paralela | "Cada comissão fica amarrada ao negócio que a gerou — e dá pra dividir entre quem participou." |
| 9 | 17:30–19:30 | Analytics | Mostrar aquisição de leads por canal, carteira por corretor, resultado financeiro do período | Gestor enxerga o negócio inteiro de um só lugar | "Isso substitui a planilha de acompanhamento mensal que vocês provavelmente já têm hoje." |
| 10 | 19:30–20:00 | Encerramento | Voltar ao Dashboard, resumir a jornada completa | Fecha o ciclo: tudo que foi mostrado está conectado | "Todas essas telas são a MESMA informação, vista de ângulos diferentes — não são sistemas separados." |

## Perguntas frequentes durante a demo (e como responder)

- **"Isso integra com o Instagram/WhatsApp pra postar direto?"** → Não ainda — o sistema gera a imagem e a legenda prontas; o envio/postagem é manual, pelo corretor. (Nunca prometer automação que não existe.)
- **"Posso importar meus imóveis de uma planilha?"** → Hoje o cadastro é manual pela interface; importação em massa não está disponível — registrar como interesse para avaliação futura, não prometer prazo.
- **"Quantos corretores posso ter?"** → Depende do plano — remeter à proposta comercial (`03-proposta-comercial.md`), nunca prometer número na hora sem checar o plano certo.
- **"Meus dados ficam seguros de outras imobiliárias que usam o mesmo sistema?"** → Sim — arquitetura isola completamente os dados por imobiliária; mencionar que isso foi validado tecnicamente em testes automatizados (sem entrar em detalhe técnico, a menos que perguntado).
- **"Tem aplicativo de celular?"** → Não é um app nativo — é um site que funciona bem no navegador do celular.
- **"Quanto custa?"** → Reservar para o fechamento da conversa, usando a proposta de `07-precificacao.md` — nunca improvisar valor na demonstração.

## Ambiente de demonstração — dados fictícios

**Proposta**: criar (ou reaproveitar) uma organização de demonstração dedicada, com dados claramente fictícios (nomes como "Imobiliária Demo", "Cliente Exemplo 1", fotos de banco de imagens livres de direitos), em ambiente de homologação/local — nunca em produção.

Esta fase **não cria** esse ambiente automaticamente (fora do escopo autorizado); a decisão de qual ambiente usar (local, uma organização de teste em produção claramente rotulada como demo, ou um ambiente de staging dedicado) é uma decisão operacional do responsável de produto antes da primeira demonstração real.
