# Inventário do cenário de demonstração

**Organização**: Imobiliária Horizonte — Demonstração
**Slug**: `imobiliaria-horizonte-demo`
**Ambiente**: local apenas (Postgres de desenvolvimento, nunca produção)
**Gerado por**: `prisma/seed-demo.ts`

Todos os dados abaixo são **fictícios**, gerados deterministicamente pelo script. Nenhum nome, telefone, e-mail ou endereço corresponde a pessoa ou imóvel real.

## Usuários (4)

| Papel | Nome | E-mail |
|---|---|---|
| OWNER (admin) | Patrícia Horizonte (Admin) | `admin@imobiliariahorizonte.demo` |
| BROKER | Marcos Vinícius Corretor | `corretor1@imobiliariahorizonte.demo` |
| BROKER | Beatriz Lima Corretora | `corretor2@imobiliariahorizonte.demo` |
| BROKER | Diego Fernandes Corretor | `corretor3@imobiliariahorizonte.demo` |

Senha (todos): `DemoHorizonte2026!` — ver `03-guia-preparacao.md` para como provisionar com segurança.

## Imóveis (12)

Mix de apartamentos e casas, venda e locação, em bairros fictícios de São Paulo — 9 disponíveis, 1 reservado, 1 vendido, 1 alugado (estados variados, igual a um portfólio real em operação):

| Título | Tipo | Finalidade | Bairro | Preço | Status |
|---|---|---|---|---|---|
| Apartamento 2 quartos no Itaim | Apartamento | Venda | Itaim Bibi | R$ 780.000 | Disponível |
| Cobertura duplex na Vila Olímpia | Apartamento | Venda | Vila Olímpia | R$ 1.850.000 | Disponível |
| Casa térrea com quintal no Brooklin | Casa | Venda | Brooklin | R$ 1.200.000 | Disponível |
| Studio mobiliado na Bela Vista | Apartamento | Locação | Bela Vista | R$ 2.600/mês | Disponível |
| Apartamento 3 quartos no Tatuapé | Apartamento | Locação | Tatuapé | R$ 3.200/mês | Disponível |
| Casa em condomínio em Santana | Casa | Venda e locação | Santana | R$ 950.000 / R$ 4.500/mês | Disponível |
| Apartamento compacto na Lapa | Apartamento | Venda | Lapa | R$ 420.000 | Disponível |
| Sobrado reformado no Ipiranga | Casa | Venda | Ipiranga | R$ 680.000 | Disponível |
| Apartamento garden na Mooca | Apartamento | Locação | Mooca | R$ 2.900/mês | Disponível |
| Cobertura vendida em Pinheiros | Apartamento | Venda | Pinheiros | R$ 1.400.000 | **Vendido** |
| Casa alugada no Alto de Pinheiros | Casa | Locação | Alto de Pinheiros | R$ 6.500/mês | **Alugado** |
| Apartamento reservado na Saúde | Apartamento | Venda | Saúde | R$ 590.000 | **Reservado** |

Cada imóvel tem 1 foto de capa (placeholder gerado — ver `05-checklist-visual.md`, limitação conhecida).

## Clientes (15)

15 pessoas fictícias (nomes brasileiros comuns, e-mails `@imobiliariahorizonte.demo`, telefones sintéticos no padrão `(11) 99000-10XX` — nunca gerados ao acaso, nunca um número que possa pertencer a alguém real). 8 têm negociação ativa (ver abaixo); 7 permanecem como "Novo lead" sem corretor atribuído, representando o funil real de entrada.

## Negociações (8) — `PropertyInterest`, nunca `Deal`

| Cliente | Imóvel | Estágio | Corretor responsável |
|---|---|---|---|
| Mariana Souza Lima | Apartamento 2 quartos no Itaim | Interessado | Marcos Vinícius |
| Pedro Henrique Costa | Cobertura duplex na Vila Olímpia | Interessado | Beatriz Lima |
| Ana Beatriz Ferreira | Casa térrea no Brooklin | Visita agendada | Marcos Vinícius |
| Lucas Gabriel Oliveira | Studio na Bela Vista | Visita agendada | Diego Fernandes |
| Juliana Alves Pereira | Apartamento no Tatuapé | Visitado | Beatriz Lima |
| Rafael Augusto Santos | Casa em Santana | Proposta | Marcos Vinícius |
| Camila Rodrigues Martins | Cobertura vendida em Pinheiros | **Ganho** (R$ 460.000, comissão R$ 23.000, R$ 12.000 já recebidos) | Diego Fernandes |
| Bruno Henrique Carvalho | Apartamento compacto na Lapa | Perdido | Beatriz Lima |

Histórico de estágio real (`PropertyInterestStageHistory`) gravado para cada transição — não derivado de `updatedAt`, mesma doutrina do resto do produto.

## Atividades (7)

4 visitas futuras (agendadas), 3 visitas já concluídas, 2 follow-ups de primeiro contato — cobrindo os estados "Hoje" (0, nenhuma marcada exatamente para hoje no momento do seed), "Próximas" (4) e "Anteriores" (3) da Agenda.

## Comissão

1 negociação ganha com comissão registrada (R$ 23.000), 1 participante (Diego Fernandes), 1 pagamento parcial já liquidado (R$ 12.000) — demonstra o ledger de pagamento, não só o valor total.

## Reprodutibilidade

Executar `prisma/seed-demo.ts` novamente com a organização já criada **não duplica nada** — o script verifica o volume de imóveis existente e encerra sem ação se o cenário já está montado (idempotência real, testada nesta fase).
