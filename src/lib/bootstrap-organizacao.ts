import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { CUSTO_BCRYPT } from "@/lib/senha";
import { prisma } from "@/lib/prisma";

// Subconjunto ESTRUTURAL do cliente, e não Prisma.TransactionClient: o
// projeto usa um cliente estendido ($extends, guarda de tenant em
// src/lib/prisma.ts) e o tipo de transaction dele não é compatível com
// o tipo nominal do Prisma. Mesmo padrão já adotado em acesso-token.ts.
type ClienteBootstrap = Pick<
  typeof prisma,
  "organization" | "subscription" | "user" | "organizationMember"
>;

// =======================================================================
// Bootstrap de uma organização (Fase 26)
// =======================================================================
// Extraído de src/app/platform/organizations/nova/actions.ts, que era o
// único lugar do produto capaz de criar um tenant. Com o cadastro
// self-service passaram a existir DOIS caminhos, e duas cópias das
// mesmas regras divergiriam em silêncio: um trial calculado diferente,
// um default de visibilidade esquecido, um OWNER criado com outro
// status. O que muda entre os dois caminhos é apenas o STATUS DO
// VÍNCULO — e é justamente isso que entra por parâmetro.
//
// Recebe `tx`, nunca o cliente global: quem chama decide o limite
// transacional, e este serviço nunca abre transação própria (aninhar
// transações no Prisma não faz o que parece).

export type PlanoBootstrap = {
  id: string;
  isTrial: boolean;
  trialDays: number | null;
};

export type EntradaBootstrap = {
  nomeOrganizacao: string;
  slug: string;
  cnpj?: string | null;
  plano: PlanoBootstrap;
  nomeResponsavel: string;
  emailResponsavel: string;
  // INVITED: o Super Admin criou a organização para alguém que ainda
  // precisa provar posse do e-mail (o convite é essa prova).
  // ACTIVE: o self-service, onde a posse do e-mail JÁ foi provada antes
  // de a organização existir — exigir uma segunda prova seria pedir à
  // pessoa que confirme duas vezes o mesmo e-mail.
  statusVinculo: "INVITED" | "ACTIVE";
};

export type ResultadoBootstrap = {
  organizationId: string;
  userId: string;
  membershipId: string;
  // true quando a identidade foi criada agora. Quem chama usa isso para
  // decidir se pede senha — nunca para revelar ao público se o e-mail
  // já existia.
  identidadeNova: boolean;
};

export async function bootstrapOrganizacao(
  tx: ClienteBootstrap,
  entrada: EntradaBootstrap
): Promise<ResultadoBootstrap> {
  const organization = await tx.organization.create({
    data: {
      name: entrada.nomeOrganizacao,
      slug: entrada.slug,
      cnpj: entrada.cnpj || null,
      planId: entrada.plano.id,
      active: true,
      // timezone e commercialVisibility NÃO são passados de propósito:
      // ficam nos defaults do schema (null -> UTC explícito, e
      // COLLABORATIVE). Pedir fuso no cadastro seria uma pergunta a mais
      // antes de a pessoa ver qualquer valor, e o produto já trata null
      // como "ninguém escolheu" e avisa disso na Home (Fase 19).
    },
    select: { id: true },
  });

  // Trial é SEMPRE calculado no servidor, a partir de Plan.trialDays no
  // instante da criação — nunca vem de formulário. Planos pagos não
  // geram Subscription nesta fase (não há cobrança real ainda).
  if (entrada.plano.isTrial && entrada.plano.trialDays !== null) {
    const agora = new Date();
    await tx.subscription.create({
      data: {
        organizationId: organization.id,
        planId: entrada.plano.id,
        status: "TRIALING",
        currentPeriodStart: agora,
        currentPeriodEnd: new Date(
          agora.getTime() + entrada.plano.trialDays * 24 * 60 * 60 * 1000
        ),
      },
    });
  }

  // Identidade GLOBAL: se o e-mail já existe, reusa. Abrir uma segunda
  // imobiliária não cria uma segunda pessoa — e o nome digitado no
  // cadastro não sobrescreve o nome de quem já tem conta.
  let user = await tx.user.findUnique({
    where: { email: entrada.emailResponsavel },
    select: { id: true },
  });
  const identidadeNova = !user;
  if (!user) {
    // Hash de um UUID aleatório: não é senha temporária, é um valor que
    // ninguém digitou e ninguém conhece. A barreira real de acesso é
    // active:false, que auth.ts recusa antes de comparar senha.
    const sentinela = await bcrypt.hash(randomUUID(), CUSTO_BCRYPT);
    user = await tx.user.create({
      data: {
        name: entrada.nomeResponsavel,
        email: entrada.emailResponsavel,
        passwordHash: sentinela,
        active: false,
      },
      select: { id: true },
    });
  }

  // OWNER é DERIVADO AQUI, no servidor. Nenhum caminho aceita papel
  // vindo de formulário: quem cria a imobiliária é dona dela, e ponto.
  const member = await tx.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER",
      status: entrada.statusVinculo,
    },
    select: { id: true },
  });

  return {
    organizationId: organization.id,
    userId: user.id,
    membershipId: member.id,
    identidadeNova,
  };
}
