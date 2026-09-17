import { Suspense } from "react";
import { decimalParaValor } from "@/lib/valor-fechamento";
import Link from "next/link";
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
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgendamentoVisita } from "@/components/admin/AgendamentoVisita";
import { FechamentoInteresse } from "@/components/admin/FechamentoInteresse";
import { RecomendacaoClienteItem } from "@/components/admin/RecomendacaoClienteItem";
import { buscarClientesCompativeis } from "@/lib/property-matching";
import { obterProximaAcaoComercial } from "@/lib/proxima-acao-comercial";
import { estagioInteresseEncerrado, ESTAGIO_INTERESSE_LABEL } from "@/lib/property-interest-schema";

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
  // Ocupação das quatro posições da vitrine — uma consulta, usada só
  // para rotular as opções do seletor.
  const ocupacaoVitrine = await buscarOcupacaoVitrine(organizationId);
  const opcoesEmpreendimento = await listarOpcoesEmpreendimento(organizationId);

  const [
    [imovel, { opcoesImovel, opcoesCondominio }, { opcoesResidencial, opcoesComercial }, interesses],
    clientesCompativeis,
    crmHabilitado,
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
        prisma.propertyInterest.findMany({
          where: { organizationId, propertyId: id },
          orderBy: { updatedAt: "desc" },
          include: {
            person: { select: { id: true, name: true } },
            // Visita SCHEDULED mais próxima por scheduledAt — batch numa
            // única query (Fase H.2), nunca uma consulta por item da lista.
            scheduledActivities: {
              where: { organizationId, status: "SCHEDULED" },
              orderBy: { scheduledAt: "asc" },
              take: 1,
              select: { id: true, scheduledAt: true, notes: true },
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
  ]);

  if (!imovel) notFound();

  const atualizarComId = atualizarImovel.bind(null, imovel.id);

  return (
    <div className="space-y-5">
      <Suspense fallback={null}>
        <ToastSalvo />
      </Suspense>
      {/* Mesmo cabeçalho das telas de Configurações: título e uma linha
          dizendo o que a tela decide. */}
      <div className="min-w-0">
        <h1 className="min-w-0 break-words text-2xl font-semibold">Editar imóvel</h1>
        <p className="text-sm text-muted-foreground">
          Dados, fotos e materiais que o site publica sobre este imóvel.
        </p>
      </div>
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

      {/* Mesma anatomia de card das telas de Configurações e do
          formulário acima: título no tamanho padrão, uma linha dizendo
          o que o bloco mostra, e a largura do restante da página — não
          um bloco estreito colado embaixo do formulário. */}
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Clientes interessados</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Quem está negociando este imóvel e qual é o próximo passo de cada um.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {interesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum cliente relacionado a este imóvel ainda.
            </p>
          ) : (
            <ul className="space-y-4 text-sm">
              {interesses.map((interesse) => {
                const proximaAcao = obterProximaAcaoComercial(interesse.stage, imovel.status);
                // Mesma regra de InteresseImovelItem.tsx (Fase H.2/P.2/P.3):
                // relacionamento ENCERRADO (REJECTED ou WON) bloqueia
                // agendar nova visita, independente da "próxima ação"
                // textual da Fase G já ter avançado.
                const podeAgendarVisita =
                  !estagioInteresseEncerrado(interesse.stage) && imovel.status === "AVAILABLE";
                const proximaVisita = interesse.scheduledActivities[0]
                  ? {
                      id: interesse.scheduledActivities[0].id,
                      scheduledAtISO: interesse.scheduledActivities[0].scheduledAt.toISOString(),
                      notes: interesse.scheduledActivities[0].notes,
                    }
                  : null;
                return (
                  <li
                    key={interesse.id}
                    className="min-w-0 border-b pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <Link
                        href={`/app/clientes/${interesse.person.id}`}
                        className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {interesse.person.name}
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        {interesse.favorited && <span title="Favoritado">★</span>}
                        <Badge variant="secondary">
                          {ESTAGIO_INTERESSE_LABEL[interesse.stage] ?? interesse.stage}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Próxima ação:{" "}
                      <span className={proximaAcao.ativa ? "font-medium text-foreground" : ""}>
                        {proximaAcao.label}
                      </span>
                    </p>
                    {/* As duas superfícies de ação do interesse ficam num
                        bloco só, separadas do texto acima — antes elas
                        herdavam o mesmo espaçamento das linhas de leitura
                        e os botões pareciam soltos na lista. */}
                    <div className="mt-2 space-y-2">
                      <AgendamentoVisita
                        fuso={fuso}
                        propertyInterestId={interesse.id}
                        podeAgendar={podeAgendarVisita}
                        atividadeAgendada={proximaVisita}
                      />
                      <FechamentoInteresse
                        fuso={fuso}
                        interesseId={interesse.id}
                        stage={interesse.stage}
                        closedAtISO={interesse.closedAt ? interesse.closedAt.toISOString() : null}
                        closedValue={decimalParaValor(interesse.closedValue)}
                        // Esta é a própria página do imóvel: finalidade e
                        // status vêm dele, não de uma segunda consulta.
                        purpose={imovel.purpose}
                        propertyStatus={imovel.status}
                        lostReason={interesse.lostReason}
                        commissionValue={decimalParaValor(interesse.commissionValue)}
                        imovelTitulo={imovel.title}
                        clienteNome={interesse.person.name}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {crmHabilitado && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="min-w-0 break-words">Clientes compatíveis</CardTitle>
            <CardDescription className="min-w-0 break-words">
              Clientes cujas preferências cadastradas combinam com este imóvel.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {clientesCompativeis.totalPreferenciasNaOrganizacao === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum cliente com preferências cadastradas para comparar.
              </p>
            ) : clientesCompativeis.recomendacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum cliente compatível encontrado para este imóvel.
              </p>
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
      )}
    </div>
  );
}
