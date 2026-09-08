import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { getLimit, FEATURE_USERS } from "@/lib/entitlements";

// =======================================================================
// Primeiros passos (Fase 26)
// =======================================================================
// TODO O ESTADO É DERIVADO. Nenhuma coluna de "onboarding_step", nenhum
// booleano de "já configurou". Persistir isso criaria uma segunda fonte
// de verdade que envelhece: um tenant que apaga o logotipo continuaria
// marcado como "site personalizado" para sempre.
//
// A consequência é que a lista também se DESMARCA sozinha quando o fato
// deixa de valer, e some por completo quando tudo está feito — sem
// precisar de um botão de dispensar nem de uma linha no banco para
// lembrar que alguém clicou nele.
//
// Não é um wizard: nada aqui bloqueia navegação. É uma lista do que
// ainda falta, ao lado do produto inteiro já utilizável.

export type PassoOnboarding = {
  chave: "dados" | "imovel" | "site" | "equipe";
  titulo: string;
  descricao: string;
  href: string;
  concluido: boolean;
};

export type Onboarding = {
  passos: PassoOnboarding[];
  pendentes: number;
};

export async function buscarOnboarding(organizationId: string): Promise<Onboarding> {
  return withOrganization(organizationId, async () => {
    const [configuracoes, totalImoveis, membrosAtivos, convitesPendentes, limiteUsuarios] =
      await Promise.all([
        prisma.organizationSettings.findUnique({
          where: { organizationId },
          select: { phone: true, email: true, whatsapp: true, logoUrl: true },
        }),
        prisma.property.count({ where: { organizationId } }),
        prisma.organizationMember.count({ where: { organizationId, status: "ACTIVE" } }),
        prisma.organizationMember.count({ where: { organizationId, status: "INVITED" } }),
        getLimit(organizationId, FEATURE_USERS),
      ]);

    // "Dados da imobiliária": pelo menos UMA forma de contato. É o
    // mínimo para o site público servir para alguma coisa — sem
    // telefone, e-mail ou WhatsApp, o visitante não tem como chamar.
    const temContato = Boolean(
      configuracoes?.phone || configuracoes?.email || configuracoes?.whatsapp
    );

    const passos: PassoOnboarding[] = [
      {
        chave: "dados",
        titulo: "Complete os dados da imobiliária",
        descricao: "Telefone, e-mail ou WhatsApp — é por onde os clientes vão falar com você.",
        href: "/app/configuracoes",
        concluido: temContato,
      },
      {
        chave: "imovel",
        titulo: "Cadastre seu primeiro imóvel",
        descricao: "Seu site começa a fazer sentido quando tem o que mostrar.",
        href: "/app/imoveis/novo",
        concluido: totalImoveis > 0,
      },
      {
        chave: "site",
        titulo: "Personalize seu site",
        descricao: "Envie o logotipo e escolha as cores da sua marca.",
        href: "/app/configuracoes",
        concluido: Boolean(configuracoes?.logoUrl),
      },
    ];

    // "Convide sua equipe" só entra quando o plano PERMITE mais de um
    // usuário. No plano de entrada o limite é 1: oferecer o passo ali
    // levaria a pessoa a uma parede — o convite seria recusado pelo
    // próprio enforcement de limite. Um passo que não dá para concluir
    // não é orientação, é armadilha.
    const permiteEquipe = limiteUsuarios === null || limiteUsuarios > 1;
    if (permiteEquipe) {
      passos.push({
        chave: "equipe",
        titulo: "Convide sua equipe",
        descricao: "Cada corretor com o próprio acesso e a própria carteira.",
        href: "/app/usuarios",
        concluido: membrosAtivos > 1 || convitesPendentes > 0,
      });
    }

    return { passos, pendentes: passos.filter((passo) => !passo.concluido).length };
  });
}
