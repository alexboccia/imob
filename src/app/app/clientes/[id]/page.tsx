import Link from "next/link";
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
import { rotuloOrigemDivulgacao } from "@/lib/atribuicao";
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
import { urlCanonicaDoImovel } from "@/lib/compartilhar-imovel";
import { resolverBasePath } from "@/lib/site-url";
import { buscarHostnameCustomAtivo } from "@/lib/platform/organization-domain";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import {
  SlidersHorizontal,
  Building2,
  Handshake,
  MessageSquarePlus,
  History,
  ChevronLeft,
} from "lucide-react";
import { buscarMembrosAtribuiveis } from "@/lib/membros-organizacao";
import { paraResponsavel } from "@/lib/responsavel-negociacao";
import { paraParticipantes } from "@/lib/participacao-comissao";
import { paraPagamentos } from "@/lib/pagamento-comissao";
import { paraAtorTransicao } from "@/lib/ator-transicao";
import { precosDoImovel } from "@/lib/imovel-precos";
import { obterProximaAcaoComercial } from "@/lib/proxima-acao-comercial";
import { paraAutorInteracao, rotuloAutorInteracao } from "@/lib/autor-interacao";
import {
  temPapel,
  PAPEIS_LIQUIDACAO_COMISSAO,
  PAPEIS_DISTRIBUICAO_LEAD,
  PAPEIS_ARQUIVAMENTO,
  PAPEIS_EXCLUSAO_DEFINITIVA,
} from "@/lib/authorization";
import {
  arquivarCliente,
  restaurarCliente,
  excluirClienteDefinitivamente,
} from "@/app/app/clientes/actions";
import { GerenciarArquivamentoRegistro } from "@/components/admin/GerenciarArquivamentoRegistro";
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
import { rotuloSelecionado } from "@/lib/select-rotulo";
import { formatarDataHoraNoFuso, formatarDataNoFuso } from "@/lib/fuso-horario";
import { ClienteAbas } from "@/components/admin/cliente/ClienteAbas";
import { ClienteCabecalhoIdentificacao } from "@/components/admin/cliente/ClienteCabecalhoIdentificacao";
import { ClienteIndicadores } from "@/components/admin/cliente/ClienteIndicadores";
import { ClienteVisaoGeral } from "@/components/admin/cliente/ClienteVisaoGeral";
import { ResumoPreferencias } from "@/components/admin/cliente/ResumoPreferencias";
import { BotaoIrParaAba } from "@/components/admin/cliente/BotaoIrParaAba";

// Redesenho da ficha do cliente — ESTAGIO_LABEL/TIPO_INTERACAO_LABEL
// consolidados em src/lib/crm-labels.ts (antes duplicados aqui e em
// columns.tsx).
const ESTAGIOS = ESTAGIOS_PIPELINE;

export default async function DetalheClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba } = await searchParams;
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
    organizationParaUrlPublica,
    hostnameCustomParaUrlPublica,
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
        // code/neighborhood/city — a busca por autocomplete (abaixo)
        // precisa filtrar por código e bairro, não só pelo título.
        select: { id: true, title: true, code: true, neighborhood: true, city: true },
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
    // "Ver imóvel" (Imóveis recomendados, abaixo) precisa da URL
    // PÚBLICA — mesma resolução canônica do Kit de Divulgação na ficha
    // do imóvel (urlCanonicaDoImovel/MKT-005/MKT-006), nunca a rota
    // interna /app/imoveis/[id]: quem recebe esse link não tem (nem
    // precisa ter) acesso ao painel administrativo.
    prisma.organization.findUnique({ where: { id: organizationId }, select: { slug: true } }),
    buscarHostnameCustomAtivo(organizationId),
  ]);

  if (!pessoa) notFound();

  // Mesma guarda de urlAnuncio em imoveis/[id]/page.tsx: sem slug não há
  // basePath para montar a URL com segurança — null faz o link cair de
  // volta na rota interna (ver RecomendacaoImovelItem).
  const urlPublicaBaseImovel = organizationParaUrlPublica
    ? (imovelId: string) =>
        urlCanonicaDoImovel({
          hostnameCustom: hostnameCustomParaUrlPublica,
          basePath: resolverBasePath(organizationParaUrlPublica.slug),
          imovelId,
        })
    : null;

  const atualizarEstagioComId = atualizarEstagioFunil.bind(null, pessoa.id);
  const registrarInteracaoComId = registrarInteracao.bind(null, pessoa.id);
  const preferencia = pessoa.preference;
  // Fase 8 — quais imóveis JÁ são oportunidade deste cliente. Derivado em
  // memória dos propertyInterests que a página já carregou: nenhuma query
  // nova, nenhum N+1 no histórico de interações.
  const idsImoveisComOportunidade = new Set(
    pessoa.propertyInterests.map((interesse) => interesse.propertyId)
  );

  // Redesenho — "Próxima ação" (Visão geral): a negociação ABERTA mais
  // recentemente atualizada (propertyInterests já vem ordenada por
  // updatedAt desc) com uma ação ainda ativa. Nenhum dado novo: mesma
  // obterProximaAcaoComercial já usada em cada InteresseImovelItem.
  const proximaAcaoCliente = pessoa.propertyInterests
    .map((interesse) => ({
      interesse,
      acao: obterProximaAcaoComercial(interesse.stage, interesse.property.status),
    }))
    .find(({ acao }) => acao.ativa);

  // Redesenho — "Última interação" (Visão geral): a mais recente da
  // timeline, que já vem ordenada por occurredAt desc.
  const ultimaInteracao = pessoa.interactions[0] ?? null;
  const autorUltimaInteracao = ultimaInteracao
    ? rotuloAutorInteracao(
        paraAutorInteracao(ultimaInteracao.member, organizationId),
        ultimaInteracao.origin
      )
    : null;

  const posse = (
    <PosseContato
      personId={pessoa.id}
      nomePessoa={pessoa.name}
      responsavel={paraResponsavelPessoa(pessoa.responsibleMember, organizationId)}
      souEu={pessoa.responsibleMemberId === (session?.user.organizationMemberId ?? null)}
      podeAtribuir={podeAtribuirContato}
      membros={membrosAtribuiveis}
      variante="pill"
    />
  );

  const valoresEdicao = {
    nome: pessoa.name,
    email: pessoa.email,
    telefone: pessoa.phone,
    observacoes: pessoa.notes,
  };

  const estagioFunilForm = (
    <form action={atualizarEstagioComId} className="flex gap-2">
      <Select name="estagioFunil" defaultValue={pessoa.pipelineStage}>
        <SelectTrigger className="w-full">
          {/* Fase 105 — mesmo achado visual de InteresseImovelItem: sem
              children, o trigger mostrava o valor cru ("NEW_LEAD") em vez
              do rótulo. Mesma correção (src/lib/select-rotulo.ts), já
              usada em dois seletores públicos — mas AQUI como string
              pronta, nunca como função: esta página é Server Component,
              e uma função como children de um Client Component não
              atravessa a fronteira. */}
          <SelectValue>
            {rotuloSelecionado(pessoa.pipelineStage, ESTAGIO_LABEL, "Estágio")}
          </SelectValue>
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
  );

  const proximaAcaoConteudo = proximaAcaoCliente ? (
    <div className="space-y-3 text-sm">
      <p>
        <span className="font-medium">{proximaAcaoCliente.acao.label}</span>
        {" — "}
        {proximaAcaoCliente.interesse.property.title}
      </p>
      <p className="text-muted-foreground">
        Negociação em {ESTAGIO_LABEL[proximaAcaoCliente.interesse.stage] ?? proximaAcaoCliente.interesse.stage}.
      </p>
      <div className="flex flex-wrap gap-2">
        <BotaoIrParaAba aba="historico" variant="default">
          Registrar atendimento
        </BotaoIrParaAba>
        <BotaoIrParaAba aba="imoveis" variant="outline">
          Relacionar imóvel
        </BotaoIrParaAba>
      </div>
    </div>
  ) : (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Nenhuma ação comercial pendente neste momento. Registre um atendimento ou relacione um
        imóvel para começar uma negociação.
      </p>
      <div className="flex flex-wrap gap-2">
        <BotaoIrParaAba aba="historico" variant="default">
          Registrar atendimento
        </BotaoIrParaAba>
        <BotaoIrParaAba aba="imoveis" variant="outline">
          Relacionar imóvel
        </BotaoIrParaAba>
      </div>
    </div>
  );

  const ultimaInteracaoConteudo = ultimaInteracao ? (
    <div className="space-y-1">
      <p className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{TIPO_INTERACAO_LABEL[ultimaInteracao.type]}</Badge>
        {formatarDataHoraNoFuso(ultimaInteracao.occurredAt, fuso)}
      </p>
      {autorUltimaInteracao && (
        <p className="text-xs text-muted-foreground">por {autorUltimaInteracao}</p>
      )}
      {ultimaInteracao.notes && <p className="text-foreground">{ultimaInteracao.notes}</p>}
    </div>
  ) : null;

  // Preview compacto (até 3) — a lista completa, com todos os critérios,
  // continua na aba Imóveis; nenhum dado novo, só um recorte da mesma
  // lista já calculada por buscarImoveisCompativeis.
  const recomendacoesPreview =
    recomendacoes.length > 0 ? (
      <div className="space-y-3">
        {recomendacoes.slice(0, 3).map((recomendacao) => (
          <RecomendacaoImovelItem
            key={recomendacao.property.id}
            pessoaId={pessoa.id}
            variante="compacta"
            recomendacao={{
              ...recomendacao,
              property: {
                ...recomendacao.property,
                ...precosDoImovel(recomendacao.property),
                fotoCapaUrl: recomendacao.property.media?.[0]?.url ?? null,
              },
            }}
            urlPublicaImovel={urlPublicaBaseImovel?.(recomendacao.property.id) ?? null}
          />
        ))}
      </div>
    ) : null;

  // --- Aba Imóveis — combina recomendados (curadoria do algoritmo) e
  // relacionados (negociações reais), como duas seções distintas, nunca
  // uma lista só.
  const abaImoveis = (
    <div className="space-y-8">
      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Building2}
          titulo="Imóveis recomendados"
          tom="azul"
          descricao="Imóveis disponíveis que atendem os critérios de Preferências de imóvel."
        />
        {!preferencia ? (
          <EstadoVazio
            icone={SlidersHorizontal}
            titulo="Nenhuma preferência cadastrada ainda"
            descricao="Defina o que este cliente procura na aba Preferências para ver recomendações aqui."
          />
        ) : recomendacoes.length === 0 ? (
          <EstadoVazio
            icone={Building2}
            titulo="Nenhum imóvel corresponde aos critérios atuais"
            descricao="Ajuste os critérios na aba Preferências, ou aguarde novos imóveis disponíveis."
          />
        ) : (
          <div className="space-y-3">
            {recomendacoes.map((recomendacao) => (
              <RecomendacaoImovelItem
                key={recomendacao.property.id}
                pessoaId={pessoa.id}
                recomendacao={{
                  ...recomendacao,
                  property: {
                    ...recomendacao.property,
                    ...precosDoImovel(recomendacao.property),
                    fotoCapaUrl: recomendacao.property.media?.[0]?.url ?? null,
                  },
                }}
                urlPublicaImovel={urlPublicaBaseImovel?.(recomendacao.property.id) ?? null}
              />
            ))}
          </div>
        )}
      </section>

      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Handshake}
          titulo="Imóveis relacionados"
          tom="azul"
          descricao="Negociações abertas com este cliente — a mesma lista aparece no Pipeline."
        />
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

        {pessoa.propertyInterests.length === 0 ? (
          <EstadoVazio
            icone={Handshake}
            titulo="Nenhum imóvel relacionado ainda."
            descricao="Relacione um imóvel acima, ou use 'Relacionar' numa recomendação."
          />
        ) : (
          <div className="space-y-3">
            {pessoa.propertyInterests.map((interesse) => {
              // A lista já vem ordenada por scheduledAt: o primeiro de
              // cada tipo é o compromisso mais próximo daquele tipo.
              // Visita e follow-up são dimensões separadas e podem
              // coexistir na mesma negociação.
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
                      ...precosDoImovel(interesse.property),
                      status: interesse.property.status,
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

  // --- Aba Histórico — "Registrar nova interação" no topo, timeline
  // completa abaixo (nada mudou no formulário nem na timeline, só a
  // posição dentro da nova estrutura de abas).
  const abaHistorico = (
    <div className="space-y-8">
      <section id="registrar-interacao" className="min-w-0 scroll-mt-6 space-y-4">
        <CabecalhoSecao icone={MessageSquarePlus} titulo="Registrar nova interação" />
        <Card className="min-w-0">
          <CardContent>
            <form
              action={registrarInteracaoComId}
              className="grid grid-cols-1 sm:grid-cols-4 gap-2"
            >
              <Select name="tipo" defaultValue="VISIT">
                <SelectTrigger className="w-full">
                  <SelectValue>{rotuloSelecionado("VISIT", TIPO_INTERACAO_LABEL, "Tipo")}</SelectValue>
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
                      {rotuloOrigemCaptacao(interacao.origin) && (
                        <Badge variant="outline">
                          {rotuloOrigemCaptacao(interacao.origin)}
                        </Badge>
                      )}
                      {rotuloOrigemDivulgacao(interacao) !== "Não identificado" && (
                        <Badge variant="outline">
                          {rotuloOrigemDivulgacao(interacao)}
                        </Badge>
                      )}
                      {formatarDataHoraNoFuso(interacao.occurredAt, fuso)}
                    </p>
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

  const abaPreferencias = (
    <div className="space-y-4">
      <CabecalhoSecao
        icone={SlidersHorizontal}
        titulo="Preferências de imóvel"
          tom="azul"
        descricao="O que este cliente procura — usado para recomendar imóveis compatíveis, na aba Imóveis."
      />
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
    </div>
  );

  const abaVisaoGeral = (
    <ClienteVisaoGeral
      pessoaId={pessoa.id}
      telefone={pessoa.phone}
      email={pessoa.email}
      roles={pessoa.roles}
      clienteDesde={formatarDataHoraNoFuso(pessoa.createdAt, fuso)}
      estagioFunilForm={estagioFunilForm}
      proximaAcao={proximaAcaoConteudo}
      observacoes={pessoa.notes}
      valoresEdicao={valoresEdicao}
      ultimaInteracao={ultimaInteracaoConteudo}
      preferenciasResumo={
        <ResumoPreferencias
          preferencia={
            preferencia
              ? {
                  transactionType: preferencia.transactionType,
                  propertyTypes: preferencia.propertyTypes,
                  cities: preferencia.cities,
                  neighborhoods: preferencia.neighborhoods,
                  minPrice: preferencia.minPrice?.toString() ?? null,
                  maxPrice: preferencia.maxPrice?.toString() ?? null,
                  minArea: preferencia.minArea,
                  maxArea: preferencia.maxArea,
                  desiredPropertyFeatures: preferencia.desiredPropertyFeatures,
                  desiredCondoFeatures: preferencia.desiredCondoFeatures,
                }
              : null
          }
        />
      }
      recomendacoesPreview={recomendacoesPreview}
      totalRecomendados={recomendacoes.length}
    />
  );

  return (
    <div>
      {/* Barra superior (item 3.1 da autorização) — "Voltar" à esquerda,
          ações de registro à direita. Mesmas actions/permissões de
          sempre (GerenciarArquivamentoRegistro/EditarClienteDialog), só
          reposicionadas: o nome/telefone/e-mail saíram daqui para o
          cartão de identificação, abaixo. */}
      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <Link
          href="/app/clientes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Voltar para clientes
        </Link>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <GerenciarArquivamentoRegistro
            entidadeLabel="cliente"
            nomeDoRegistro={pessoa.name}
            arquivadoEm={pessoa.archivedAt ? pessoa.archivedAt.toISOString() : null}
            podeArquivar={temPapel(papel, PAPEIS_ARQUIVAMENTO)}
            podeExcluirDefinitivamente={temPapel(papel, PAPEIS_EXCLUSAO_DEFINITIVA)}
            acaoArquivar={arquivarCliente.bind(null, pessoa.id)}
            acaoRestaurar={restaurarCliente.bind(null, pessoa.id)}
            acaoExcluir={excluirClienteDefinitivamente.bind(null, pessoa.id)}
          />
          <EditarClienteDialog personId={pessoa.id} valoresIniciais={valoresEdicao} />
        </div>
      </div>

      <div className="mb-6">
        <ClienteCabecalhoIdentificacao
          nome={pessoa.name}
          telefone={pessoa.phone}
          email={pessoa.email}
          roles={pessoa.roles}
          pipelineStage={pessoa.pipelineStage}
          clienteDesde={formatarDataHoraNoFuso(pessoa.createdAt, fuso)}
          arquivadoEm={pessoa.archivedAt ? pessoa.archivedAt.toISOString() : null}
          posse={posse}
          indicadores={
            <ClienteIndicadores
              totalRelacionados={pessoa.propertyInterests.length}
              totalRecomendados={recomendacoes.length}
              ultimaInteracaoData={
                ultimaInteracao ? formatarDataNoFuso(ultimaInteracao.occurredAt, fuso) : null
              }
              ultimaInteracaoDataHoraCompleta={
                ultimaInteracao ? formatarDataHoraNoFuso(ultimaInteracao.occurredAt, fuso) : null
              }
            />
          }
        />
      </div>

      <ClienteAbas
        abaInicial={aba}
        visaoGeral={abaVisaoGeral}
        preferencias={abaPreferencias}
        imoveis={abaImoveis}
        historico={abaHistorico}
      />
    </div>
  );
}
