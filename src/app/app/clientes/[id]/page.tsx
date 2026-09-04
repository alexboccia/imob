import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  atualizarEstagioFunil,
  registrarInteracao,
} from "@/app/app/clientes/actions";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { buscarOpcoesCaracteristicas } from "@/lib/caracteristicas";
import { buscarOpcoesTiposImovel } from "@/lib/tipos-imovel";
import { buscarSugestoesLocalizacao } from "@/lib/sugestoes-localizacao";
import { rotuloOrigemCaptacao } from "@/lib/captacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";
import { PreferenciaImovelForm } from "@/components/admin/PreferenciaImovelForm";
import { InteresseImovelItem } from "@/components/admin/InteresseImovelItem";
import { RelacionarImovelForm } from "@/components/admin/RelacionarImovelForm";
import { RecomendacaoImovelItem } from "@/components/admin/RecomendacaoImovelItem";
import { buscarImoveisCompativeis } from "@/lib/property-matching";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTAGIO_LABEL, ESTAGIOS_PIPELINE, TIPO_INTERACAO_LABEL } from "@/lib/crm-labels";

// Redesenho da tela de Clientes — ESTAGIO_LABEL/TIPO_INTERACAO_LABEL
// consolidados em src/lib/crm-labels.ts (antes duplicados aqui e em
// columns.tsx).
const ESTAGIOS = ESTAGIOS_PIPELINE;

export default async function DetalheClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizationId = await requireOrganizationId();

  if (!(await hasModule(organizationId, "crm"))) {
    return (
      <div className="max-w-3xl">
        <ModuloBloqueado
          titulo="CRM não incluído no seu plano"
          descricao="Gerencie leads, clientes e o funil de vendas em um só lugar."
        />
      </div>
    );
  }

  const [
    [pessoa, { opcoesImovel, opcoesCondominio }, { opcoesResidencial, opcoesComercial }, sugestoesLocalizacao, imoveisDisponiveis],
    recomendacoes,
  ] = await Promise.all([
    withOrganization(organizationId, () =>
    Promise.all([
      prisma.person.findUnique({
        where: { id, organizationId },
        include: {
          interactions: { orderBy: { occurredAt: "desc" }, include: { property: true } },
          preference: true,
          // where: { organizationId } explícito na sub-relação — nunca
          // depender só da integridade implícita do relacionamento
          // Prisma (Person → propertyInterests). Redundante com o
          // invariante de que todo PropertyInterest.organizationId já
          // confere com o do Person referenciado, mas essa é exatamente a
          // defesa que não deve depender só de invariante de aplicação.
          propertyInterests: {
            where: { organizationId },
            orderBy: { updatedAt: "desc" },
            include: {
              property: { select: { id: true, title: true, price: true, rentPrice: true, status: true } },
              // Visita SCHEDULED mais próxima por scheduledAt — batch numa
              // única query (Fase H.2), nunca uma consulta por card.
              scheduledActivities: {
                where: { organizationId, status: "SCHEDULED" },
                orderBy: { scheduledAt: "asc" },
                take: 1,
                select: { id: true, scheduledAt: true, notes: true },
              },
            },
          },
        },
      }),
      buscarOpcoesCaracteristicas(organizationId),
      buscarOpcoesTiposImovel(organizationId),
      buscarSugestoesLocalizacao(organizationId),
      // Mesmo critério de "ativo" já usado pelo site público
      // (src/app/[orgSlug]/imoveis/page.tsx) — só imóveis AVAILABLE fazem
      // sentido como opção pra relacionar um novo interesse. Exclui
      // imóveis que a Person já tem PropertyInterest — só UX (a constraint
      // unique + o upsert idempotente já protegem a integridade mesmo que
      // um já-relacionado aparecesse aqui).
      prisma.property.findMany({
        where: {
          organizationId,
          status: "AVAILABLE",
          NOT: { interests: { some: { personId: id, organizationId } } },
        },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      }),
    ])
    ),
    // buscarImoveisCompativeis gerencia seu próprio withOrganization/
    // hasModule/validação de Person internamente — chamada como irmã do
    // bloco acima em vez de aninhada, evita withOrganization dentro de
    // withOrganization pro mesmo organizationId.
    buscarImoveisCompativeis(organizationId, id),
  ]);

  if (!pessoa) notFound();

  const atualizarEstagioComId = atualizarEstagioFunil.bind(null, pessoa.id);
  const registrarInteracaoComId = registrarInteracao.bind(null, pessoa.id);
  const preferencia = pessoa.preference;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">{pessoa.name}</h1>
      <p className="text-muted-foreground mb-6">
        {pessoa.phone ?? "sem telefone"} · {pessoa.email ?? "sem e-mail"} ·{" "}
        {pessoa.roles.join(", ")}
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Estágio no funil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={atualizarEstagioComId} className="flex gap-2">
            <Select name="estagioFunil" defaultValue={pessoa.pipelineStage}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTAGIOS.map((estagio) => (
                  <SelectItem key={estagio} value={estagio}>
                    {ESTAGIO_LABEL[estagio]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline">
              Atualizar
            </Button>
          </form>
        </CardContent>
      </Card>

      {pessoa.notes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-line">
              {pessoa.notes}
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Preferências de imóvel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PreferenciaImovelForm
            pessoaId={pessoa.id}
            existe={preferencia != null}
            valoresIniciais={
              preferencia
                ? {
                    transactionType: preferencia.transactionType,
                    propertyTypes: preferencia.propertyTypes,
                    cities: preferencia.cities,
                    neighborhoods: preferencia.neighborhoods,
                    minPrice: preferencia.minPrice?.toString() ?? null,
                    maxPrice: preferencia.maxPrice?.toString() ?? null,
                    minBedrooms: preferencia.minBedrooms,
                    minBathrooms: preferencia.minBathrooms,
                    minParkingSpots: preferencia.minParkingSpots,
                    minArea: preferencia.minArea,
                    maxArea: preferencia.maxArea,
                    desiredPropertyFeatures: preferencia.desiredPropertyFeatures,
                    desiredCondoFeatures: preferencia.desiredCondoFeatures,
                    notes: preferencia.notes,
                  }
                : undefined
            }
            opcoesTiposResidencial={opcoesResidencial}
            opcoesTiposComercial={opcoesComercial}
            opcoesCaracteristicasImovel={opcoesImovel}
            opcoesCaracteristicasCondominio={opcoesCondominio}
            sugestoesCidades={sugestoesLocalizacao.cidades}
            sugestoesBairros={sugestoesLocalizacao.bairros}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Imóveis relacionados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pessoa.propertyInterests.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum imóvel relacionado ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {pessoa.propertyInterests.map((interesse) => (
                <InteresseImovelItem
                  key={interesse.id}
                  interesse={{
                    id: interesse.id,
                    stage: interesse.stage,
                    favorited: interesse.favorited,
                    notes: interesse.notes,
                    closedAtISO: interesse.closedAt ? interesse.closedAt.toISOString() : null,
                    property: {
                      id: interesse.property.id,
                      title: interesse.property.title,
                      price: interesse.property.price,
                      rentPrice: interesse.property.rentPrice,
                      status: interesse.property.status,
                    },
                    proximaVisita: interesse.scheduledActivities[0]
                      ? {
                          id: interesse.scheduledActivities[0].id,
                          scheduledAtISO: interesse.scheduledActivities[0].scheduledAt.toISOString(),
                          notes: interesse.scheduledActivities[0].notes,
                        }
                      : null,
                  }}
                />
              ))}
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Relacionar imóvel</p>
            <RelacionarImovelForm pessoaId={pessoa.id} imoveisDisponiveis={imoveisDisponiveis} />
          </div>
        </CardContent>
      </Card>

      {preferencia && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Imóveis recomendados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recomendacoes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum imóvel com compatibilidade suficiente no momento.
              </p>
            ) : (
              <div className="space-y-3">
                {recomendacoes.map((recomendacao) => (
                  <RecomendacaoImovelItem
                    key={recomendacao.property.id}
                    pessoaId={pessoa.id}
                    recomendacao={recomendacao}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Registrar nova interação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={registrarInteracaoComId}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2"
          >
            <Select name="tipo" defaultValue="VISIT">
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_INTERACAO_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input name="notas" placeholder="Notas" className="sm:col-span-2" />
            <Button type="submit">Registrar</Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-semibold mb-3">Histórico de interações</h2>
        {pessoa.interactions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma interação registrada.
          </p>
        ) : (
          <ul className="space-y-3">
            {pessoa.interactions.map((interacao) => (
              <li key={interacao.id}>
                <Card>
                  <CardContent className="text-sm">
                    <p className="font-medium flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {TIPO_INTERACAO_LABEL[interacao.type]}
                      </Badge>
                      {/* Origem só existe em contato vindo do site
                          público; interação registrada à mão pelo
                          corretor e as anteriores a este campo não têm
                          etiqueta, em vez de mostrarem um rótulo vazio. */}
                      {rotuloOrigemCaptacao(interacao.origin) && (
                        <Badge variant="outline">
                          {rotuloOrigemCaptacao(interacao.origin)}
                        </Badge>
                      )}
                      {interacao.occurredAt.toLocaleString("pt-BR")}
                    </p>
                    {interacao.property && (
                      <p className="text-muted-foreground mt-1">
                        Imóvel: {interacao.property.title}
                      </p>
                    )}
                    {interacao.notes && (
                      <p className="text-foreground mt-1">{interacao.notes}</p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
