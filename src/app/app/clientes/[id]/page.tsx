import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  atualizarEstagioFunil,
  registrarInteracao,
} from "@/app/app/clientes/actions";
import { requireOrganizationId } from "@/lib/tenant";
import { buscarFusoOrganizacao } from "@/lib/fuso-organizacao";
import { escopoComercialDaSessao } from "@/lib/escopo-comercial-sessao";
import { wherePessoa, whereNegociacao } from "@/lib/escopo-comercial";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { buscarOpcoesCaracteristicas } from "@/lib/caracteristicas";
import { buscarOpcoesTiposImovel } from "@/lib/tipos-imovel";
import { buscarSugestoesLocalizacao } from "@/lib/sugestoes-localizacao";
import { rotuloOrigemCaptacao } from "@/lib/captacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";
import { PreferenciaImovelForm } from "@/components/admin/PreferenciaImovelForm";
import { InteresseImovelItem } from "@/components/admin/InteresseImovelItem";
import { EditarClienteDialog } from "@/components/admin/EditarClienteDialog";
import { RelacionarImovelForm } from "@/components/admin/RelacionarImovelForm";
import { BotaoCriarOportunidade } from "@/components/admin/BotaoCriarOportunidade";
import { oportunidadeElegivel } from "@/lib/oportunidade";
import { decimalParaValor } from "@/lib/valor-fechamento";
import { RecomendacaoImovelItem } from "@/components/admin/RecomendacaoImovelItem";
import { buscarImoveisCompativeis } from "@/lib/property-matching";
import { CabecalhoPagina } from "@/components/admin/ui/CabecalhoPagina";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import {
  SlidersHorizontal,
  Building2,
  Handshake,
  Milestone,
  StickyNote,
  MessageSquarePlus,
  History,
} from "lucide-react";
import { buscarMembrosAtribuiveis } from "@/lib/membros-organizacao";
import { paraResponsavel } from "@/lib/responsavel-negociacao";
import { paraParticipantes } from "@/lib/participacao-comissao";
import { paraPagamentos } from "@/lib/pagamento-comissao";
import { paraAtorTransicao } from "@/lib/ator-transicao";
import { precosDoImovel } from "@/lib/imovel-precos";
import { paraAutorInteracao, rotuloAutorInteracao } from "@/lib/autor-interacao";
import {
  temPapel,
  PAPEIS_LIQUIDACAO_COMISSAO,
  PAPEIS_DISTRIBUICAO_LEAD,
} from "@/lib/authorization";
import { PosseContato } from "@/components/admin/PosseContato";
import { paraResponsavelPessoa } from "@/lib/posse-lead";
import { papelAtual } from "@/lib/papel-atual";
import { auth } from "@/lib/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTAGIO_LABEL, ESTAGIOS_PIPELINE, TIPO_INTERACAO_LABEL } from "@/lib/crm-labels";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";

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
  // Fuso comercial da organização (Fase 18) — uma resolução por
  // carregamento, repassada a todos os itens da ficha.
  const fuso = await buscarFusoOrganizacao(organizationId);
  // Papel EFETIVO resolvido uma vez (Fase 27): a lista renderiza vários
  // itens e um await dentro do JSX de cada um seria inválido.
  const papel = await papelAtual();
  const podeLiquidar = temPapel(papel, PAPEIS_LIQUIDACAO_COMISSAO);
  const podeAtribuirContato = temPapel(papel, PAPEIS_DISTRIBUICAO_LEAD);
  const session = await auth();
  const escopo = await escopoComercialDaSessao(organizationId);
  const escopoPessoa = wherePessoa(escopo);
  const escopoInteresse = whereNegociacao(escopo);

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
    membrosAtribuiveis,
    recomendacoes,
  ] = await Promise.all([
    withOrganization(organizationId, () =>
    Promise.all([
      // Fase 22 — o ESCOPO entra aqui. `findFirst` em vez de `findUnique`
      // porque o predicado de pessoa é um OR e findUnique não o aceita;
      // `id` continua sendo único, então o resultado é o mesmo registro
      // ou null.
      //
      // Fora do escopo -> null -> notFound(). É 404, não 403: o padrão
      // que a ficha já usava para outro tenant, e que não revela se o
      // cliente existe.
      prisma.person.findFirst({
        where: { ...escopoPessoa, id, organizationId },
        include: {
          interactions: {
            orderBy: { occurredAt: "desc" },
            include: {
              property: true,
              // Fase 15 — AUTOR no MESMO include batched da timeline:
              // uma query para a ficha inteira, nunca uma por interação.
              member: {
                select: {
                  id: true,
                  status: true,
                  organizationId: true,
                  user: { select: { name: true } },
                },
              },
            },
          },
          preference: true,
          // Fase 36 — quem CONDUZ este cliente. Na mesma consulta da
          // pessoa; redigido contra tenant na leitura, como todo membro
          // exibido no produto.
          responsibleMember: {
            select: {
              id: true,
              organizationId: true,
              status: true,
              user: { select: { name: true } },
            },
          },
          // where: { organizationId } explícito na sub-relação — nunca
          // depender só da integridade implícita do relacionamento
          // Prisma (Person → propertyInterests). Redundante com o
          // invariante de que todo PropertyInterest.organizationId já
          // confere com o do Person referenciado, mas essa é exatamente a
          // defesa que não deve depender só de invariante de aplicação.
          // Fase 22 — PII COMPARTILHADO, NEGOCIAÇÕES SEPARADAS.
          //
          // Se dois corretores têm negociações com o mesmo cliente, os
          // dois veem a pessoa (o telefone dela não pode existir em duas
          // versões — é entidade da organização). Mas cada um vê apenas
          // as SUAS negociações: é nelas que está o trabalho comercial
          // que a política restrita separa.
          //
          // A timeline de interações NÃO é escopada de propósito: uma
          // Interaction pertence à pessoa e não a uma negociação (não há
          // propertyInterestId nela), e fragmentar o histórico de contato
          // faria dois corretores ligarem para o mesmo cliente sem saber.
          propertyInterests: {
            where: { ...escopoInteresse, organizationId },
            orderBy: { updatedAt: "desc" },
            include: {
              property: {
                select: {
                  id: true,
                  title: true,
                  purpose: true,
                  price: true,
                  rentPrice: true,
                  status: true,
                },
              },
              // Compromissos SCHEDULED desta negociação, batch numa única
              // query (Fase H.2), nunca uma consulta por card.
              //
              // Fase 19 — o `take: 1` SAIU. Com dois tipos possíveis, ele
              // devolveria "o mais próximo, seja qual for", e a visita e o
              // follow-up mais próximos podem ser linhas diferentes; a
              // separação acontece em memória logo abaixo. O teto de 20 é
              // defensivo (uma negociação com 20 compromissos abertos já é
              // uma anomalia operacional), não paginação.
              // Fase 37 — a lista passou a trazer, além dos compromissos
              // ABERTOS, as visitas já ENCERRADAS com o que cada uma
              // produziu. Uma relação só (o Prisma não permite incluir a
              // mesma duas vezes com filtros diferentes), separada em
              // memória logo abaixo — e continua sendo UMA query para a
              // ficha inteira, nunca uma por negociação.
              //
              // MÚLTIPLAS VISITAS, CADA UMA COM SEU RESULTADO: nada é
              // achatado num "último resultado" da negociação; a segunda
              // visita não apaga o que aconteceu na primeira.
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
              // Fase 33 — as propostas desta negociação, no mesmo select
              // batched: uma query para a lista inteira, nunca uma por
              // negociação. Mais recente primeiro, que é a ordem em que
              // a tela lê ("qual foi o último valor?"). Teto defensivo
              // de 50 — uma negociação com mais que isso é anomalia, não
              // paginação.
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
              // Fase 12 — participantes da divisão, no MESMO select
              // batched das demais relações: uma query para a lista
              // inteira, nunca uma por negociação (zero N+1).
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
                  // Fase 13 — ledger de pagamentos, no MESMO select
                  // batched: uma query para a ficha inteira, nunca uma
                  // por participante. Traz também os CANCELADOS, que
                  // continuam no histórico e apenas saem da soma.
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
              // Fase 14 — última transição de etapa + o membro que a
              // executou, no MESMO select batched. take: 1 porque a
              // ficha mostra a linha de fechamento, não uma timeline.
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
              // Fase 11 — responsável pela negociação, no mesmo select
              // batched das demais relações. Nunca uma query por card.
              responsibleMember: {
                select: {
                  id: true,
                  status: true,
                  organizationId: true,
                  user: { select: { name: true } },
                },
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
    // Fase 11 — uma query só para a tela inteira: alimenta o seletor do
    // formulário de relacionar imóvel E o diálogo de transferência de
    // cada negociação já existente.
    buscarMembrosAtribuiveis(organizationId),
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
  // Fase 8 — quais imóveis JÁ são oportunidade deste cliente. Derivado em
  // memória dos propertyInterests que a página já carregou: nenhuma query
  // nova, nenhum N+1 no histórico de interações.
  const idsImoveisComOportunidade = new Set(
    pessoa.propertyInterests.map((interesse) => interesse.propertyId)
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <CabecalhoPagina
          titulo={pessoa.name}
          descricao={`${pessoa.phone ?? "sem telefone"} · ${pessoa.email ?? "sem e-mail"} · ${pessoa.roles.join(", ")}`}
          acoes={
            <EditarClienteDialog
              personId={pessoa.id}
              valoresIniciais={{
                nome: pessoa.name,
                email: pessoa.email,
                telefone: pessoa.phone,
                observacoes: pessoa.notes,
              }}
            />
          }
        />
        {/* Fase 125 — Person.createdAt já existia (vem na mesma query,
            `include` nunca escondeu nenhum campo escalar) e nunca
            aparecia em lugar nenhum: nem aqui, nem na listagem, nem no
            drawer. Para um cliente recém-cadastrado, sem nenhuma
            Interaction e sem nenhuma negociação ainda, a ficha inteira
            não tinha NENHUMA data respondendo "desde quando ele é nosso
            cliente" — a mesma pergunta que a Fase 92 já resolveu para a
            negociação ("Criada em..."), nunca para a Person em si. */}
        <p className="mt-1 text-xs text-muted-foreground">
          Cliente desde {formatarDataHoraNoFuso(pessoa.createdAt, fuso)}
        </p>
      </div>

      {/* Fase 36 — de quem é este cliente. Mesmo componente da caixa de
          entrada, e mesmas actions: a resposta não pode depender da tela
          onde a pergunta foi feita. NÃO é o responsável das negociações
          dele, que continua sendo declarado negócio a negócio abaixo. */}
      <div className="mb-6">
        <PosseContato
          personId={pessoa.id}
          nomePessoa={pessoa.name}
          responsavel={paraResponsavelPessoa(pessoa.responsibleMember, organizationId)}
          souEu={pessoa.responsibleMemberId === (session?.user.organizationMemberId ?? null)}
          podeAtribuir={podeAtribuirContato}
          membros={membrosAtribuiveis}
        />
      </div>

      {/* Fase 79 — estágio GERAL da pessoa no funil de leads
          (Person.pipelineStage: NEW_LEAD/CONTACTED/...), manual, sem
          relação com PropertyInterest.stage (o estágio de CADA
          negociação, em Imóveis relacionados/Pipeline abaixo). Os dois
          usam a palavra "estágio" por coincidência de vocabulário, não
          porque sejam o mesmo dado — descricao explicita a diferença. */}
      <section className="mb-6 min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Milestone}
          titulo="Estágio no funil"
          descricao="Estágio geral deste cliente, usado nos filtros da lista de Clientes — diferente do estágio de cada negociação, em Imóveis relacionados."
        />
        <Card className="min-w-0">
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
      </section>

      {pessoa.notes && (
        <section className="mb-6 min-w-0 space-y-4">
          <CabecalhoSecao icone={StickyNote} titulo="Observações" />
          <Card className="min-w-0">
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-line">
                {pessoa.notes}
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="mb-6 min-w-0 space-y-4">
        <CabecalhoSecao
          icone={SlidersHorizontal}
          titulo="Preferências de imóvel"
          descricao="O que este cliente procura — usado para recomendar imóveis compatíveis, logo abaixo."
        />
        <Card className="min-w-0">
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
      </section>

      {/* Fase 77 — sempre renderizada, com três estados reais e
          distintos (nunca "0 encontrados" para quem não tem perfil, que
          é uma pergunta diferente de "tem perfil e não bateu nenhum
          imóvel"). Sem Card envolvendo a lista: cada RecomendacaoImovelItem
          já É um Card.
          Fase 79 — esta seção veio para ANTES de "Imóveis relacionados"
          (ordem original: relacionados antes de recomendados, invertida):
          a jornada real é recomendação → corretor decide relacionar, e a
          seção que ainda não existe (recomendados) fazia mais sentido
          vir depois da que já é resultado de uma decisão (relacionados)
          — nenhuma seção tem outra estrutura ou dado alterado, só a
          posição. */}
      <section className="mb-6 min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Building2}
          titulo="Imóveis recomendados"
          descricao="Imóveis disponíveis que atendem os critérios de Preferências de imóvel, acima."
        />
        {!preferencia ? (
          <EstadoVazio
            icone={SlidersHorizontal}
            titulo="Nenhuma preferência cadastrada ainda"
            descricao="Defina o que este cliente procura em Preferências de imóvel, acima, para ver recomendações aqui."
          />
        ) : recomendacoes.length === 0 ? (
          <EstadoVazio
            icone={Building2}
            titulo="Nenhum imóvel corresponde aos critérios atuais"
            descricao="Ajuste os critérios em Preferências de imóvel, acima, ou aguarde novos imóveis disponíveis."
          />
        ) : (
          <div className="space-y-3">
            {recomendacoes.map((recomendacao) => (
              <RecomendacaoImovelItem
                key={recomendacao.property.id}
                pessoaId={pessoa.id}
                // Fase 16 — mesma conversão na fronteira: o resultado
                // do matching carrega os preços como Decimal cru.
                recomendacao={{
                  ...recomendacao,
                  property: {
                    ...recomendacao.property,
                    ...precosDoImovel(recomendacao.property),
                  },
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Fase 78 — esta seção é a curadoria: cada item já é um
          PropertyInterest real (Fase D do CRM), a MESMA negociação que
          aparece no Pipeline (Fase P.4, projeção operacional de
          PropertyInterest — nunca uma segunda fonte de verdade) e na
          ficha do imóvel ("Clientes interessados"). "Relacionar" (em
          Imóveis recomendados acima e na ficha do imóvel) sempre
          cria/reusa o MESMO registro — não existem dois modelos para a
          mesma relação. Sem Card envolvendo a lista, pelo mesmo motivo
          de "Imóveis recomendados": cada InteresseImovelItem já É um
          Card. */}
      <section className="mb-6 min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Handshake}
          titulo="Imóveis relacionados"
          descricao="Negociações abertas com este cliente — a mesma lista aparece no Pipeline."
        />
        {pessoa.propertyInterests.length === 0 ? (
          <EstadoVazio
            icone={Handshake}
            titulo="Nenhum imóvel relacionado ainda."
            descricao="Relacione um imóvel manualmente abaixo, ou use 'Relacionar' numa recomendação em Imóveis recomendados, acima."
          />
        ) : (
            <div className="space-y-3">
              {pessoa.propertyInterests.map((interesse) => {
                // A lista já vem ordenada por scheduledAt: o primeiro de
                // cada tipo é o compromisso mais próximo daquele tipo.
                // Visita e follow-up são dimensões separadas e podem
                // coexistir na mesma negociação.
                // O filtro de status é OBRIGATÓRIO aqui desde a Fase 37:
                // a relação passou a trazer visitas encerradas junto, e
                // sem ele a ficha anunciaria como "próxima" uma visita
                // que já aconteceu.
                const proximaVisita = interesse.scheduledActivities.find(
                  (a) => a.type === "VISIT" && a.status === "SCHEDULED"
                );
                const proximoFollowUp = interesse.scheduledActivities.find(
                  (a) => a.type === "FOLLOW_UP" && a.status === "SCHEDULED"
                );
                // Encerradas, mais recente primeiro — a ordem em que a
                // tela lê ("o que aconteceu da última vez?").
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
                    property: {
                      id: interesse.property.id,
                      title: interesse.property.title,
                      purpose: interesse.property.purpose,
                      // Fase 16 — Decimal do Prisma convertido AQUI, na
                      // fronteira servidor→cliente. Mesmo racional (e
                      // mesma solução) já usada no formulário de imóvel.
                      ...precosDoImovel(interesse.property),
                      status: interesse.property.status,
                    },
                    propostas: interesse.offers.map((o) => ({
                      id: o.id,
                      valor: decimalParaValor(o.amount) ?? 0,
                      lado: o.side,
                      ocorridoEmISO: o.offeredAt.toISOString(),
                      // Nome redigido quando a relação é cross-tenant —
                      // mesma defesa em profundidade do resto da tela.
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
                          // subject é obrigatório em regra de aplicação
                          // para FOLLOW_UP; o fallback só existe para não
                          // quebrar a tela diante de uma linha anômala.
                          assunto: proximoFollowUp.subject ?? "Follow-up",
                          scheduledAtISO: proximoFollowUp.scheduledAt.toISOString(),
                          notes: proximoFollowUp.notes,
                        }
                      : null,
                    // Membro de outro tenant é redigido para null dentro
                    // de paraResponsavel — o nome jamais chega à tela.
                    responsavel: paraResponsavel(interesse.responsibleMember, organizationId),
                    // Fase 14 — num negócio encerrado a última transição
                    // é o próprio fechamento. Redigido contra tenant.
                    atorFechamento: paraAtorTransicao(
                      interesse.stageHistory[0]?.changedByMember ?? null,
                      organizationId
                    ),
                    // Mesma defesa em paraParticipantes: linha anômala
                    // apontando para outro tenant é descartada na leitura.
                    participantes: paraParticipantes(
                      interesse.participants.map((p) => ({
                        ...p,
                        allocationValue: decimalParaValor(p.allocationValue),
                      })),
                      organizationId
                    ),
                    // Fase 13 — ledger por participante, já saneado
                    // contra linha cross-tenant em paraPagamentos.
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

        <Card className="min-w-0">
          <CardContent>
            <p className="text-sm font-medium mb-2">Relacionar imóvel</p>
            <RelacionarImovelForm
              pessoaId={pessoa.id}
              imoveisDisponiveis={imoveisDisponiveis}
              membros={membrosAtribuiveis}
              membroAtualId={session?.user.organizationMemberId ?? null}
            />
          </CardContent>
        </Card>
      </section>

      {/* Fase 87 — id de âncora: a Busca global oferece um atalho
          direto pra cá ("Registrar interação" no resultado de cliente),
          porque medição real mostrou ~1,8-2,4 telas de rolagem até aqui
          mesmo num cliente recém-criado sem nenhuma negociação. scroll-mt
          dá um respiro visual no destino (não existe cabeçalho fixo
          nesta página, mas encostar o heading na borda do viewport
          continua desconfortável de ler). */}
      <section id="registrar-interacao" className="mb-6 min-w-0 scroll-mt-6 space-y-4">
        <CabecalhoSecao icone={MessageSquarePlus} titulo="Registrar nova interação" />
        <Card className="min-w-0">
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
      </section>

      {/* Fase 79 — heading real (já era h2, agora via CabecalhoSecao
          como o resto da ficha) num <section> real: público-form.spec.ts
          e captacao-pendente.spec.ts localizavam o histórico subindo do
          h2 pro pai direto (xpath=..) — com o h2 agora aninhado dentro
          de CabecalhoSecao, o pai direto não é mais quem contém a lista;
          os dois specs foram adaptados para escopar pelo <section>. */}
      <section className="min-w-0 space-y-4">
        <CabecalhoSecao icone={History} titulo="Histórico de interações" />
        {pessoa.interactions.length === 0 ? (
          <EstadoVazio icone={History} titulo="Nenhuma interação registrada" />
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
                      {formatarDataHoraNoFuso(interacao.occurredAt, fuso)}
                    </p>
                    {/* Fase 15 — AUTORIA em texto, na timeline que já
                        existia. Nunca aparece em captação pública: ali o
                        fato é completo (quem originou foi o visitante) e
                        a etiqueta de origem acima já diz isso — escrever
                        "autor não registrado" sugeriria dado faltante
                        onde não há. Membro de outro tenant é redigido
                        dentro de paraAutorInteracao. */}
                    {rotuloAutorInteracao(
                      paraAutorInteracao(interacao.member, organizationId),
                      interacao.origin
                    ) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        por{" "}
                        {rotuloAutorInteracao(
                          paraAutorInteracao(interacao.member, organizationId),
                          interacao.origin
                        )}
                      </p>
                    )}
                    {interacao.property && (
                      <p className="text-muted-foreground mt-1">
                        Imóvel: {interacao.property.title}
                      </p>
                    )}
                    {interacao.notes && (
                      <p className="text-foreground mt-1">{interacao.notes}</p>
                    )}
                    {/* Fase 8 — só para contato de captação sobre um
                        imóvel específico (ver oportunidadeElegivel). O
                        botão some quando o imóvel já virou oportunidade
                        deste cliente: o par (pessoa, imóvel) é único, e
                        oferecer a ação de novo só levaria a uma mensagem
                        de "já existe". */}
                    {oportunidadeElegivel(interacao) &&
                      !idsImoveisComOportunidade.has(interacao.propertyId!) && (
                        <BotaoCriarOportunidade interactionId={interacao.id} />
                      )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
