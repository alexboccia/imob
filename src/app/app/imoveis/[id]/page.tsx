import { Suspense } from "react";
import { decimalParaValor } from "@/lib/valor-fechamento";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ImovelForm } from "@/components/admin/ImovelForm";
import { buscarOcupacaoVitrine } from "@/lib/vitrine-home-consultas";
import { atualizarImovel } from "@/app/app/imoveis/actions";
import { buscarOpcoesCaracteristicas } from "@/lib/caracteristicas";
import { buscarOpcoesTiposImovel } from "@/lib/tipos-imovel";
import { listarOpcoesEmpreendimento } from "@/lib/empreendimento-consultas";
import { ToastSalvo } from "@/components/admin/ToastSalvo";
import { requireOrganizationId } from "@/lib/tenant";
import { buscarFusoOrganizacao } from "@/lib/fuso-organizacao";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoPagina } from "@/components/admin/ui/CabecalhoPagina";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import { Handshake, UserSearch } from "lucide-react";
import { InteresseImovelItem } from "@/components/admin/InteresseImovelItem";
import { RecomendacaoClienteItem } from "@/components/admin/RecomendacaoClienteItem";
import { buscarClientesCompativeis } from "@/lib/property-matching";
import { papelAtual } from "@/lib/papel-atual";
import { temPapel, PAPEIS_LIQUIDACAO_COMISSAO } from "@/lib/authorization";
import { buscarMembrosAtribuiveis } from "@/lib/membros-organizacao";
import { paraResponsavel } from "@/lib/responsavel-negociacao";
import { paraParticipantes } from "@/lib/participacao-comissao";
import { paraPagamentos } from "@/lib/pagamento-comissao";
import { paraAtorTransicao } from "@/lib/ator-transicao";
import { precosDoImovel } from "@/lib/imovel-precos";
import { GerarAnuncioImovel } from "@/components/admin/GerarAnuncioImovel";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { buscarBranding } from "@/lib/branding";
import { temWhatsApp } from "@/lib/whatsapp";

const MEDIA_TYPE_PARA_TIPO_MIDIA = {
  PHOTO: "FOTO",
  VIDEO: "VIDEO",
  FLOOR_PLAN: "PLANTA",
  // Fase 39 — o tour percorre o MESMO caminho do vídeo: uma URL colada
  // no formulário, serializada com as demais mídias.
  VIRTUAL_TOUR: "TOUR",
} as const;

export default async function EditarImovelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizationId = await requireOrganizationId();
  // Fuso comercial da organização (Fase 18) — uma resolução por
  // carregamento, repassada a todos os itens da ficha.
  const fuso = await buscarFusoOrganizacao(organizationId);
  // Fase 80 — mesma checagem da ficha do cliente: registrar/cancelar
  // pagamento de comissão exige papel gerencial. O servidor recusa de
  // qualquer forma; isto é só a tela não oferecer o que não é permitido.
  const papel = await papelAtual();
  const podeLiquidar = temPapel(papel, PAPEIS_LIQUIDACAO_COMISSAO);
  // Ocupação das quatro posições da vitrine — uma consulta, usada só
  // para rotular as opções do seletor.
  const ocupacaoVitrine = await buscarOcupacaoVitrine(organizationId);
  const opcoesEmpreendimento = await listarOpcoesEmpreendimento(organizationId);

  const [
    [imovel, { opcoesImovel, opcoesCondominio }, { opcoesResidencial, opcoesComercial }, interesses],
    clientesCompativeis,
    crmHabilitado,
    membrosAtribuiveis,
    config,
    branding,
    organization,
  ] = await Promise.all([
    withOrganization(organizationId, () =>
      Promise.all([
        prisma.property.findUnique({
          where: { id, organizationId },
          include: {
            media: { orderBy: [{ isCover: "desc" }, { order: "asc" }] },
            // Todos os materiais, ativos ou não: a edição precisa ver o
            // que está desativado pra poder reativar. Quem filtra por
            // `active` é a ficha pública.
            presentationMaterials: { orderBy: { sortOrder: "asc" } },
            // Fase 42 — escopado também pela organização, como os demais
            // modelos do tenant.
            nearbyPlaces: { where: { organizationId }, orderBy: { order: "asc" } },
          },
        }),
        buscarOpcoesCaracteristicas(organizationId),
        buscarOpcoesTiposImovel(organizationId),
        // Escopado por organizationId explícito, igual a toda outra query
        // deste arquivo — nunca confiar só no propertyId da URL.
        //
        // Fase 80 — enriquecida para bater com a MESMA query da ficha do
        // cliente (/app/clientes/[id]/page.tsx): "Clientes interessados"
        // passou a reusar InteresseImovelItem por inteiro (ver comentário
        // na renderização abaixo), que precisa de propostas/participantes/
        // pagamentos/histórico/responsável para renderizar as mesmas
        // ações já disponíveis do lado do cliente. Continua UMA query só
        // para a lista inteira — nenhuma consulta nova por item.
        prisma.propertyInterest.findMany({
          where: { organizationId, propertyId: id },
          orderBy: { updatedAt: "desc" },
          include: {
            person: { select: { id: true, name: true } },
            // Mesmo filtro/teto da ficha do cliente (Fase 37/H.2): traz
            // tanto os compromissos ABERTOS quanto as visitas já
            // ENCERRADAS com o que produziram, numa relação só.
            scheduledActivities: {
              where: {
                organizationId,
                OR: [
                  { status: "SCHEDULED" },
                  { type: "VISIT", status: { in: ["COMPLETED", "NO_SHOW"] } },
                ],
              },
              orderBy: { scheduledAt: "asc" },
              take: 30,
              select: {
                id: true,
                type: true,
                status: true,
                subject: true,
                scheduledAt: true,
                notes: true,
                visitOutcome: true,
                outcomeNotes: true,
              },
            },
            offers: {
              where: { organizationId },
              orderBy: { offeredAt: "desc" },
              take: 50,
              select: {
                id: true,
                amount: true,
                side: true,
                offeredAt: true,
                createdByMember: {
                  select: { organizationId: true, user: { select: { name: true } } },
                },
              },
            },
            participants: {
              where: { organizationId },
              select: {
                id: true,
                memberId: true,
                organizationId: true,
                allocationValue: true,
                member: {
                  select: {
                    status: true,
                    organizationId: true,
                    user: { select: { name: true } },
                  },
                },
                payments: {
                  where: { organizationId },
                  select: {
                    id: true,
                    organizationId: true,
                    amount: true,
                    paidAt: true,
                    cancelledAt: true,
                    createdByMember: {
                      select: { organizationId: true, user: { select: { name: true } } },
                    },
                  },
                },
              },
            },
            stageHistory: {
              where: { organizationId },
              orderBy: { changedAt: "desc" as const },
              take: 1,
              select: {
                changedByMember: {
                  select: {
                    id: true,
                    status: true,
                    organizationId: true,
                    user: { select: { name: true } },
                  },
                },
              },
            },
            responsibleMember: {
              select: {
                id: true,
                status: true,
                organizationId: true,
                user: { select: { name: true } },
              },
            },
          },
        }),
      ])
    ),
    // buscarClientesCompativeis gerencia seu próprio withOrganization/
    // hasModule/validação de Property internamente — chamada como irmã
    // do bloco acima em vez de aninhada, mesmo racional da Fase E: evita
    // withOrganization dentro de withOrganization pro mesmo organizationId.
    buscarClientesCompativeis(organizationId, id),
    // Só pra decidir se a seção "Clientes compatíveis" renderiza — não é
    // um novo entitlement, é a mesma checagem que buscarClientesCompativeis
    // já faz internamente. hasModule é React.cache()-deduplicado por
    // request (mesmo organizationId+"crm"), então essa chamada paralela
    // não gera uma segunda query real. "Clientes interessados" (seção
    // irmã, pré-existente) deliberadamente NÃO ganhou esse gate agora —
    // fora do escopo desta correção, pra não mexer em comportamento já
    // estabelecido.
    hasModule(organizationId, "crm"),
    // Fase 80 — uma query só para a ficha inteira, mesmo padrão da Fase
    // 11 na ficha do cliente: alimenta o seletor de responsável de cada
    // InteresseImovelItem, nunca uma consulta por card.
    buscarMembrosAtribuiveis(organizationId),
    // MKT-003 — mesma fonte que o Route Handler de anúncio já usa
    // (route.ts) para nome/logo/WhatsApp da organização. A legenda é
    // gerada 100% client-side (função pura, sem request novo) porque
    // esta página já está autorizada a ver esses dados — trazê-los aqui
    // evita uma chamada de rede só pra montar um texto.
    buscarConfiguracaoContato(organizationId),
    buscarBranding(organizationId),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);

  if (!imovel) notFound();

  const atualizarComId = atualizarImovel.bind(null, imovel.id);
  const precosAnuncio = precosDoImovel(imovel);
  const nomeOrganizacaoAnuncio = branding.displayName ?? organization?.name ?? "";
  const whatsappAnuncio = temWhatsApp(config.whatsapp) ? config.whatsapp : null;

  return (
    <div className="space-y-5">
      <Suspense fallback={null}>
        <ToastSalvo />
      </Suspense>
      <CabecalhoPagina
        titulo="Editar imóvel"
        descricao="Dados, fotos e materiais que o site publica sobre este imóvel."
        acoes={
          <GerarAnuncioImovel
            propertyId={imovel.id}
            titulo={imovel.title}
            tipo={imovel.type}
            cidade={imovel.city}
            purpose={imovel.purpose}
            price={precosAnuncio.price}
            rentPrice={precosAnuncio.rentPrice}
            condoFee={decimalParaValor(imovel.condoFee)}
            propertyTax={decimalParaValor(imovel.propertyTax)}
            neighborhood={imovel.neighborhood}
            city={imovel.city}
            state={imovel.state}
            totalArea={imovel.totalArea}
            privateArea={imovel.privateArea}
            bedrooms={imovel.bedrooms}
            suites={imovel.suites}
            bathrooms={imovel.bathrooms}
            parkingSpots={imovel.parkingSpots}
            nomeOrganizacao={nomeOrganizacaoAnuncio}
            whatsapp={whatsappAnuncio}
            fotos={imovel.media
              .filter((m) => m.type === "PHOTO")
              .map((m) => ({ id: m.id, url: m.url }))}
          />
        }
      />
      <ImovelForm
        action={atualizarComId}
        propertyId={imovel.id}
        locaisProximosIniciais={imovel.nearbyPlaces.map((l) => ({
          id: l.id,
          categoria: l.category,
          nome: l.name,
          distancia: l.distance,
          unidade: l.distanceUnit,
        }))}
        valoresIniciais={{
          titulo: imovel.title,
          // Fase 38 — o vínculo atual, para o seletor abrir no valor certo.
          empreendimentoId: imovel.developmentId,
          descricao: imovel.description,
          // Fase 40 — o valor atual, para o formulário abrir com a frase
          // já cadastrada (e permitir limpá-la apagando o campo).
          fraseDestaque: imovel.highlightPhrase,
          // Fase 45 — conteúdo editorial da foto de destaque.
          tituloDestaque: imovel.heroTitle,
          subtituloDestaque: imovel.heroSubtitle,
          tipo: imovel.type,
          finalidade: imovel.purpose,
          status: imovel.status,
          cep: imovel.zipCode,
          logradouro: imovel.street,
          numero: imovel.number,
          complemento: imovel.complement,
          bairro: imovel.neighborhood,
          cidade: imovel.city,
          estado: imovel.state,
          latitude: imovel.latitude,
          longitude: imovel.longitude,
          // Decimal do Prisma não é objeto serializável: passá-lo direto
          // pro formulário (Client Component) faz o React avisar
          // "Only plain objects can be passed to Client Components" no
          // console a cada campo de preço preenchido. O formulário já
          // trata esses valores como número, então a conversão acontece
          // aqui, na fronteira servidor→cliente.
          preco: decimalParaValor(imovel.price),
          precoAluguel: decimalParaValor(imovel.rentPrice),
          precoCondominio: decimalParaValor(imovel.condoFee),
          precoIptu: decimalParaValor(imovel.propertyTax),
          observacaoValor: imovel.priceNote,
          areaTotal: imovel.totalArea,
          areaPrivativa: imovel.privateArea,
          quartos: imovel.bedrooms,
          suites: imovel.suites,
          banheiros: imovel.bathrooms,
          vagasGaragem: imovel.parkingSpots,
          caracteristicasImovel: imovel.propertyFeatures,
          caracteristicasCondominio: imovel.condoFeatures,
          lancamento: imovel.isLaunch,
          destaque: imovel.isFeatured,
          posicaoDestaqueHome: imovel.homeHighlightPosition,
          oportunidade: imovel.isOpportunity,
          slideshow: imovel.hasSlideshow,
          estagioObra: imovel.constructionStage,
          previsaoEntrega: imovel.deliveryForecast,
          construtora: imovel.developer,
        }}
        midiasIniciais={imovel.media.map((m) => ({
          tipo: MEDIA_TYPE_PARA_TIPO_MIDIA[m.type],
          url: m.url,
          ehCapa: m.isCover,
          // Fase 45 — a legenda volta no mesmo item da foto.
          ...(m.type === "PHOTO" && m.caption ? { legenda: m.caption } : {}),
        }))}
        materiaisIniciais={imovel.presentationMaterials.map((m) => ({
          name: m.name,
          url: m.url,
          active: m.active,
        }))}
        opcoesCaracteristicasImovel={opcoesImovel}
        opcoesCaracteristicasCondominio={opcoesCondominio}
        opcoesEmpreendimento={opcoesEmpreendimento}
        opcoesTiposResidencial={opcoesResidencial}
        opcoesTiposComercial={opcoesComercial}
        ocupacaoVitrine={ocupacaoVitrine}
      />

      {/* Fase 80 — ordem espelha a ficha do cliente (Fase 79): o que o
          algoritmo recomenda vem antes da decisão de relacionar. Aqui é
          "Clientes compatíveis" (matching reverso) antes de "Clientes
          interessados" (as negociações reais). */}
      {crmHabilitado && (
        // Fase 87 — id de âncora: medição real mostrou 5,6-8,8 TELAS de
        // rolagem até aqui num imóvel recém-criado (o formulário de
        // cadastro inteiro vem antes) — a Busca global usa este id pra
        // pular direto pra cá a partir de um resultado de imóvel.
        <section id="clientes-compativeis" className="min-w-0 scroll-mt-6 space-y-4">
          <CabecalhoSecao
            icone={UserSearch}
            titulo="Clientes compatíveis"
            descricao="Clientes cujas preferências cadastradas combinam com este imóvel."
          />
          <Card className="min-w-0">
            <CardContent className="min-w-0">
              {clientesCompativeis.totalPreferenciasNaOrganizacao === 0 ? (
                <EstadoVazio
                  icone={UserSearch}
                  titulo="Nenhum cliente com preferências cadastradas para comparar"
                />
              ) : clientesCompativeis.recomendacoes.length === 0 ? (
                <EstadoVazio
                  icone={UserSearch}
                  titulo="Nenhum cliente compatível encontrado para este imóvel"
                />
              ) : (
                <ul className="space-y-4 text-sm">
                  {clientesCompativeis.recomendacoes.map((recomendacao) => (
                    <RecomendacaoClienteItem
                      key={recomendacao.person.id}
                      propertyId={imovel.id}
                      propertyStatus={imovel.status}
                      // Fase 16 — objeto EXPLÍCITO em vez do resultado
                      // inteiro do matching. `calcularCompatibilidade`
                      // devolve `property` junto (o model completo, com os
                      // Decimal de price/rentPrice/condoFee/propertyTax), e
                      // passar a variável direto não dispara a checagem de
                      // excesso do TypeScript — então o Prisma Decimal
                      // atravessava a fronteira sem ninguém notar. Aqui só
                      // vai o que o componente declara, o que também deixa
                      // de mandar o imóvel inteiro para o navegador.
                      recomendacao={{
                        score: recomendacao.score,
                        activeSoftCriteriaCount: recomendacao.activeSoftCriteriaCount,
                        criteria: recomendacao.criteria,
                        existingInterest: recomendacao.existingInterest,
                        person: recomendacao.person,
                      }}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Fase 80 — "Clientes interessados" passou a reusar
          InteresseImovelItem por inteiro (o mesmo componente de "Imóveis
          relacionados", na ficha do cliente), em vez de uma segunda
          implementação com AgendamentoVisita/FechamentoInteresse soltos
          e uma cópia manual da regra de bloqueio de agendamento. Ganho
          real, não só estético: esta lista passa a ter as MESMAS ações
          já disponíveis do lado do cliente — trocar responsável, dividir
          comissão, registrar proposta, favoritar, remover — que antes só
          existiam se o corretor saísse desta tela e fosse até a ficha da
          pessoa. A prop `pessoa` diz ao componente para mostrar o nome
          do cliente (com link) no lugar do título do imóvel, que aqui
          seria repetido em toda linha sem necessidade. */}
      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Handshake}
          titulo="Clientes interessados"
          descricao="Negociações abertas com este imóvel — a mesma lista aparece no Pipeline."
        />
        {interesses.length === 0 ? (
          <EstadoVazio
            icone={Handshake}
            titulo="Nenhum cliente relacionado a este imóvel ainda."
            descricao="Use 'Relacionar' numa recomendação em Clientes compatíveis, acima, ou relacione pela ficha do cliente."
          />
        ) : (
          <div className="space-y-3">
            {interesses.map((interesse) => {
              const proximaVisita = interesse.scheduledActivities.find(
                (a) => a.type === "VISIT" && a.status === "SCHEDULED"
              );
              const proximoFollowUp = interesse.scheduledActivities.find(
                (a) => a.type === "FOLLOW_UP" && a.status === "SCHEDULED"
              );
              const visitasEncerradas = interesse.scheduledActivities
                .filter((a) => a.type === "VISIT" && a.status !== "SCHEDULED")
                .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
                .map((a) => ({
                  id: a.id,
                  scheduledAtISO: a.scheduledAt.toISOString(),
                  status: a.status,
                  visitOutcome: a.visitOutcome,
                  outcomeNotes: a.outcomeNotes,
                }));
              return (
                <InteresseImovelItem
                  key={interesse.id}
                  fuso={fuso}
                  membros={membrosAtribuiveis}
                  podeLiquidar={podeLiquidar}
                  pessoa={{ id: interesse.person.id, name: interesse.person.name }}
                  interesse={{
                    id: interesse.id,
                    stage: interesse.stage,
                    favorited: interesse.favorited,
                    notes: interesse.notes,
                    createdAtISO: interesse.createdAt.toISOString(),
                    closedAtISO: interesse.closedAt ? interesse.closedAt.toISOString() : null,
                    closedValue: decimalParaValor(interesse.closedValue),
                    lostReason: interesse.lostReason,
                    commissionValue: decimalParaValor(interesse.commissionValue),
                    // A mesma Property se repete em toda linha desta
                    // lista (é a ficha de UM imóvel só) — sem query
                    // adicional, é o `imovel` já carregado no topo da
                    // página, convertido pela mesma `precosDoImovel` que
                    // o formulário acima já usa na fronteira Decimal→
                    // number.
                    property: {
                      id: imovel.id,
                      title: imovel.title,
                      purpose: imovel.purpose,
                      status: imovel.status,
                      ...precosDoImovel(imovel),
                    },
                    propostas: interesse.offers.map((o) => ({
                      id: o.id,
                      valor: decimalParaValor(o.amount) ?? 0,
                      lado: o.side,
                      ocorridoEmISO: o.offeredAt.toISOString(),
                      registradoPor:
                        o.createdByMember && o.createdByMember.organizationId === organizationId
                          ? o.createdByMember.user.name
                          : null,
                    })),
                    visitasEncerradas,
                    proximaVisita: proximaVisita
                      ? {
                          id: proximaVisita.id,
                          scheduledAtISO: proximaVisita.scheduledAt.toISOString(),
                          notes: proximaVisita.notes,
                        }
                      : null,
                    proximoFollowUp: proximoFollowUp
                      ? {
                          id: proximoFollowUp.id,
                          assunto: proximoFollowUp.subject ?? "Follow-up",
                          scheduledAtISO: proximoFollowUp.scheduledAt.toISOString(),
                          notes: proximoFollowUp.notes,
                        }
                      : null,
                    responsavel: paraResponsavel(interesse.responsibleMember, organizationId),
                    atorFechamento: paraAtorTransicao(
                      interesse.stageHistory[0]?.changedByMember ?? null,
                      organizationId
                    ),
                    participantes: paraParticipantes(
                      interesse.participants.map((p) => ({
                        ...p,
                        allocationValue: decimalParaValor(p.allocationValue),
                      })),
                      organizationId
                    ),
                    pagamentosPorParticipante: Object.fromEntries(
                      interesse.participants.map((p) => [
                        p.id,
                        paraPagamentos(
                          p.payments.map((pg) => ({
                            ...pg,
                            amount: decimalParaValor(pg.amount) ?? 0,
                          })),
                          organizationId
                        ),
                      ])
                    ),
                  }}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
