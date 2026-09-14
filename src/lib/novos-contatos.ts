import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { ORIGENS_CAPTACAO } from "@/lib/captacao";
import { wherePessoa, type EscopoComercial } from "@/lib/escopo-comercial";

// =======================================================================
// Novos contatos — a caixa de entrada comercial
// =======================================================================
// POR QUE ISTO EXISTE
//
// A cadeia do produto é IMÓVEL → DIVULGAÇÃO → INTERESSE → LEAD →
// ATENDIMENTO. Até aqui, o elo LEAD → ATENDIMENTO não tinha superfície
// nenhuma: um contato do site vira uma `Interaction` no banco, dispara
// um e-mail que é OPCIONAL por design (degrada com warn e o fluxo
// continua), e depois some. A Central responde "o que tenho agendado";
// a lista de clientes responde "quem são meus clientes". Ninguém
// respondia "quem acabou de levantar a mão, e o que eu faço agora".
//
// -----------------------------------------------------------------------
// O QUE É "NOVO" — DERIVADO, NUNCA PERSISTIDO
// -----------------------------------------------------------------------
// Nenhuma coluna nova, nenhum enum, nenhuma migration. O estado sai de
// dois fatos que o domínio JÁ registra, e a distinção entre eles é
// estrutural:
//
//   Interaction.memberId = null  -> contato que CHEGOU (site público;
//                                   ninguém vira autor por receber)
//   Interaction.memberId != null -> atendimento REGISTRADO por alguém
//                                   (registrarInteracao, Fase 15)
//
// Um contato está AGUARDANDO quando chegou pelo site e, DEPOIS dele,
// ninguém registrou atendimento para aquela pessoa nem abriu negociação.
// A comparação é por instante, não por existência: um cliente antigo que
// manda mensagem nova hoje volta para a caixa de entrada, que é
// exatamente o que um corretor espera.
//
// -----------------------------------------------------------------------
// COMO SAI DA LISTA
// -----------------------------------------------------------------------
// Por AÇÃO COMERCIAL, jamais por "visto". Um sinal de leitura exigiria
// estado por usuário e diria apenas que alguém olhou — e olhar não é
// atender. Registrar o atendimento ou criar a oportunidade tira o item
// da fila; abrir a tela não tira nada.
//
// -----------------------------------------------------------------------
// O QUE ESTA CAIXA NÃO AFIRMA
// -----------------------------------------------------------------------
// Não há score, "lead quente", temperatura nem próxima melhor ação. A
// única ordenação é o relógio, e o único destaque é a espera — ambos
// verificáveis, ambos explicáveis para o corretor.
// =======================================================================

/** Origens que representam um contato entrando pelo site público. */
const ORIGENS_DO_SITE = Object.values(ORIGENS_CAPTACAO);

/** Quantos itens a Central mostra. A CONTAGEM continua exata. */
export const LIMITE_NOVOS_CONTATOS = 5;

// Teto da varredura de candidatos. Protege a consulta de uma organização
// com histórico muito grande sem transformar a fila num OFFSET profundo:
// acima disso o número vira "500+" na tela, em vez de a página ficar
// lenta. Nenhuma organização real do produto chega perto hoje.
export const TETO_VARREDURA = 500;

// Um contato só é ALERTA depois de um dia inteiro sem atendimento. Não é
// urgência inventada: é o mesmo raciocínio do "atrasado" da Agenda —
// passou o dia, ninguém tocou.
export const HORAS_PARA_ALERTA = 24;

export type NovoContato = {
  /** id da Interaction — é ele que as ações comerciais recebem. */
  id: string;
  ocorridoEmISO: string;
  /** Catálogo de src/lib/captacao.ts; a tela traduz com rotuloOrigemCaptacao. */
  origem: string | null;
  /** O que a pessoa escreveu. Pode ser longo; a tela decide o recorte. */
  mensagem: string | null;
  /** Fato derivado do relógio, calculado no servidor para a tela não divergir. */
  aguardandoHaHoras: number;
  pessoa: { id: string; nome: string; telefone: string | null; email: string | null };
  imovel: {
    id: string;
    titulo: string;
    codigo: number | null;
    finalidade: string;
    /** String, não Decimal: é a convenção do projeto para atravessar o
        limite do RSC (mesma de paraImovelCard). */
    preco: string | null;
    precoAluguel: string | null;
    foto: string | null;
    /** Nome de quem responde pelo imóvel — responde "quem é o responsável?". */
    responsavel: string | null;
  } | null;
};

export type NovosContatos = {
  itens: NovoContato[];
  /** Exato até TETO_VARREDURA; acima disso, `truncado` fica true. */
  total: number;
  truncado: boolean;
};

export async function buscarNovosContatos(
  organizationId: string,
  escopo: EscopoComercial,
  opcoes: { limite?: number; agora?: Date } = {}
): Promise<NovosContatos> {
  const limite = opcoes.limite ?? LIMITE_NOVOS_CONTATOS;
  const agora = opcoes.agora ?? new Date();

  return withOrganization(organizationId, async () => {
    // 1) Candidatos: contatos do site, sem autor, de pessoas DENTRO do
    //    escopo comercial de quem está olhando. O predicado de
    //    autorização vai no `where` (wherePessoa), nunca num filter em
    //    memória — PII não sai do banco sem autorização.
    const candidatos = await prisma.interaction.findMany({
      where: {
        organizationId,
        memberId: null,
        origin: { in: ORIGENS_DO_SITE },
        person: { is: wherePessoa(escopo) },
      },
      select: { id: true, personId: true, occurredAt: true },
      orderBy: { occurredAt: "desc" },
      take: TETO_VARREDURA,
    });

    if (candidatos.length === 0) return { itens: [], total: 0, truncado: false };

    const pessoaIds = [...new Set(candidatos.map((c) => c.personId))];

    // 2) Os fatos de trabalho, agregados — duas consultas, não uma por
    //    contato. O que importa é o INSTANTE do fato mais recente de
    //    cada pessoa.
    const [atendimentos, negociacoes] = await Promise.all([
      prisma.interaction.groupBy({
        by: ["personId"],
        where: { organizationId, personId: { in: pessoaIds }, memberId: { not: null } },
        _max: { occurredAt: true },
      }),
      prisma.propertyInterest.groupBy({
        by: ["personId"],
        where: { organizationId, personId: { in: pessoaIds } },
        _max: { createdAt: true },
      }),
    ]);

    const ultimoTrabalho = new Map<string, number>();
    for (const a of atendimentos) {
      const t = a._max.occurredAt?.getTime();
      if (t) ultimoTrabalho.set(a.personId, Math.max(ultimoTrabalho.get(a.personId) ?? 0, t));
    }
    for (const n of negociacoes) {
      const t = n._max.createdAt?.getTime();
      if (t) ultimoTrabalho.set(n.personId, Math.max(ultimoTrabalho.get(n.personId) ?? 0, t));
    }

    // 3) Só a comparação de instantes acontece em memória — recência, não
    //    autorização, que já foi resolvida na consulta acima.
    const aguardando = candidatos.filter(
      (c) => c.occurredAt.getTime() > (ultimoTrabalho.get(c.personId) ?? 0)
    );

    const pagina = aguardando.slice(0, limite);
    if (pagina.length === 0) {
      return { itens: [], total: 0, truncado: false };
    }

    // 4) PII e contexto comercial só dos itens que a tela vai mostrar.
    const detalhes = await prisma.interaction.findMany({
      where: { id: { in: pagina.map((c) => c.id) }, organizationId },
      select: {
        id: true,
        occurredAt: true,
        origin: true,
        notes: true,
        person: { select: { id: true, name: true, phone: true, email: true } },
        property: {
          select: {
            id: true,
            title: true,
            code: true,
            purpose: true,
            price: true,
            rentPrice: true,
            media: {
              where: { type: "PHOTO" },
              orderBy: [{ isCover: "desc" }, { order: "asc" }],
              take: 1,
              select: { url: true },
            },
            responsibleMember: { select: { user: { select: { name: true } } } },
          },
        },
      },
    });

    const porId = new Map(detalhes.map((d) => [d.id, d]));
    const itens: NovoContato[] = [];
    for (const candidato of pagina) {
      const d = porId.get(candidato.id);
      if (!d) continue;
      itens.push({
        id: d.id,
        ocorridoEmISO: d.occurredAt.toISOString(),
        origem: d.origin,
        mensagem: d.notes,
        aguardandoHaHoras: Math.max(
          0,
          Math.floor((agora.getTime() - d.occurredAt.getTime()) / 3_600_000)
        ),
        pessoa: {
          id: d.person.id,
          nome: d.person.name,
          telefone: d.person.phone,
          email: d.person.email,
        },
        imovel: d.property
          ? {
              id: d.property.id,
              titulo: d.property.title,
              codigo: d.property.code,
              finalidade: d.property.purpose,
              preco: d.property.price ? d.property.price.toString() : null,
              precoAluguel: d.property.rentPrice ? d.property.rentPrice.toString() : null,
              foto: d.property.media[0]?.url ?? null,
              responsavel: d.property.responsibleMember?.user.name ?? null,
            }
          : null,
      });
    }

    return {
      itens,
      total: aguardando.length,
      truncado: candidatos.length === TETO_VARREDURA,
    };
  });
}
