import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ImovelForm } from "@/components/admin/ImovelForm";
import { atualizarImovel } from "@/app/app/imoveis/actions";
import { buscarOpcoesCaracteristicas } from "@/lib/caracteristicas";
import { buscarOpcoesTiposImovel } from "@/lib/tipos-imovel";
import { ToastSalvo } from "@/components/admin/ToastSalvo";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
} as const;

// Prisma devolve Decimal (objeto com toString) para colunas monetárias.
// null continua null — nunca vira 0, que seria "preço zero" em vez de
// "sem preço".
function decimalParaNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor.toString());
  return Number.isNaN(n) ? null : n;
}

export default async function EditarImovelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizationId = await requireOrganizationId();

  const [
    [imovel, { opcoesImovel, opcoesCondominio }, { opcoesResidencial, opcoesComercial }, interesses],
    clientesCompativeis,
    crmHabilitado,
  ] = await Promise.all([
    withOrganization(organizationId, () =>
      Promise.all([
        prisma.property.findUnique({
          where: { id, organizationId },
          include: { media: { orderBy: [{ isCover: "desc" }, { order: "asc" }] } },
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
    <div>
      <Suspense fallback={null}>
        <ToastSalvo />
      </Suspense>
      <h1 className="text-2xl font-semibold mb-6">Editar imóvel</h1>
      <ImovelForm
        action={atualizarComId}
        propertyId={imovel.id}
        valoresIniciais={{
          titulo: imovel.title,
          descricao: imovel.description,
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
          preco: decimalParaNumero(imovel.price),
          precoAluguel: decimalParaNumero(imovel.rentPrice),
          precoCondominio: decimalParaNumero(imovel.condoFee),
          precoIptu: decimalParaNumero(imovel.propertyTax),
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
        }))}
        opcoesCaracteristicasImovel={opcoesImovel}
        opcoesCaracteristicasCondominio={opcoesCondominio}
        opcoesTiposResidencial={opcoesResidencial}
        opcoesTiposComercial={opcoesComercial}
      />

      <Card className="mt-6 max-w-3xl">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Clientes interessados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {interesses.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum cliente relacionado a este imóvel ainda.
            </p>
          ) : (
            <ul className="space-y-2">
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
                    className="text-sm border-b pb-2 last:border-b-0 last:pb-0 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Link
                        href={`/app/clientes/${interesse.person.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {interesse.person.name}
                      </Link>
                      <div className="flex items-center gap-2">
                        {interesse.favorited && <span title="Favoritado">★</span>}
                        <Badge variant="secondary">
                          {ESTAGIO_INTERESSE_LABEL[interesse.stage] ?? interesse.stage}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Próxima ação:{" "}
                      <span className={proximaAcao.ativa ? "font-medium text-foreground" : ""}>
                        {proximaAcao.label}
                      </span>
                    </p>
                    <AgendamentoVisita
                      propertyInterestId={interesse.id}
                      podeAgendar={podeAgendarVisita}
                      atividadeAgendada={proximaVisita}
                    />
                    <FechamentoInteresse
                      interesseId={interesse.id}
                      stage={interesse.stage}
                      closedAtISO={interesse.closedAt ? interesse.closedAt.toISOString() : null}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {crmHabilitado && (
        <Card className="mt-6 max-w-3xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Clientes compatíveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientesCompativeis.totalPreferenciasNaOrganizacao === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum cliente com preferências cadastradas para comparar.
              </p>
            ) : clientesCompativeis.recomendacoes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum cliente compatível encontrado para este imóvel.
              </p>
            ) : (
              <div className="space-y-3">
                {clientesCompativeis.recomendacoes.map((recomendacao) => (
                  <RecomendacaoClienteItem
                    key={recomendacao.person.id}
                    propertyId={imovel.id}
                    propertyStatus={imovel.status}
                    recomendacao={recomendacao}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
