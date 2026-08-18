import { prisma } from "@/lib/prisma";

export type StatusItemOnboarding = "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO";

export type ItemOnboarding = {
  chave: string;
  label: string;
  status: StatusItemOnboarding;
};

// Deliberadamente MAIS PERMISSIVO que "todo item do checklist precisa
// estar CONCLUIDO" (ver P.10.7.1) — domínio/e-mail próprios são
// OPCIONAIS: uma organização que nunca configurou nenhum dos dois está
// PRONTA mesmo assim (ela funciona plenamente pelo acesso padrão
// /{slug}/...). Só bloqueia quando algo foi CADASTRADO mas ficou pela
// metade (ex: domínio adicionado mas nunca chegou a ACTIVE) — nunca
// bloqueia por uma feature que a organização simplesmente não adotou.
export type PublicationStatus = "PRONTO" | "PENDENTE_OWNER" | "PENDENTE_DOMINIO" | "PENDENTE_EMAIL";

export type Onboarding = {
  itens: ItemOnboarding[];
  publicationStatus: PublicationStatus;
};

export type DadosOnboarding = {
  organizacaoExiste: boolean;
  planoSelecionado: boolean;
  ownerExiste: boolean;
  ownerAtivo: boolean;
  brandingConfigurado: boolean;
  dominioCustomCadastrado: boolean;
  dominioCustomVerificado: boolean;
  dominioCustomAtivo: boolean;
  emailDomainCadastrado: boolean;
  emailDomainVerificado: boolean;
};

// Pura, sem I/O — toda a lógica de decisão do checklist/publication
// status vive aqui, separada da leitura do banco (resolverOnboarding
// abaixo), pra ser testável sem Postgres (ver P.10.11).
export function calcularOnboarding(dados: DadosOnboarding): Onboarding {
  let publicationStatus: PublicationStatus = "PRONTO";
  if (!dados.ownerAtivo) {
    publicationStatus = "PENDENTE_OWNER";
  } else if (dados.dominioCustomCadastrado && !dados.dominioCustomAtivo) {
    publicationStatus = "PENDENTE_DOMINIO";
  } else if (dados.emailDomainCadastrado && !dados.emailDomainVerificado) {
    publicationStatus = "PENDENTE_EMAIL";
  }

  const itens: ItemOnboarding[] = [
    { chave: "organizacao_criada", label: "Organização criada", status: dados.organizacaoExiste ? "CONCLUIDO" : "PENDENTE" },
    { chave: "plano_selecionado", label: "Plano selecionado", status: dados.planoSelecionado ? "CONCLUIDO" : "PENDENTE" },
    { chave: "owner_criado", label: "Owner criado", status: dados.ownerExiste ? "CONCLUIDO" : "PENDENTE" },
    { chave: "branding_configurado", label: "Branding configurado", status: dados.brandingConfigurado ? "CONCLUIDO" : "PENDENTE" },
    // Sempre CONCLUIDO no modelo de acesso atual (path /{slug}/... já
    // funciona desde a criação da organização) — só fica meaningful de
    // verdade quando/se subdomínio wildcard real for provisionado (TODO
    // arquitetural, ver P.10.4.1).
    { chave: "subdominio_easymob", label: "Subdomínio easymob disponível", status: "CONCLUIDO" },
    {
      chave: "dominio_cadastrado",
      label: "Domínio personalizado cadastrado",
      status: dados.dominioCustomCadastrado ? "CONCLUIDO" : "PENDENTE",
    },
    {
      chave: "dns_configurado",
      label: "DNS configurado",
      status: !dados.dominioCustomCadastrado ? "PENDENTE" : dados.dominioCustomVerificado ? "CONCLUIDO" : "EM_ANDAMENTO",
    },
    {
      chave: "dominio_verificado",
      label: "Domínio verificado",
      status: !dados.dominioCustomCadastrado ? "PENDENTE" : dados.dominioCustomVerificado ? "CONCLUIDO" : "EM_ANDAMENTO",
    },
    {
      chave: "https_ativo",
      label: "HTTPS ativo",
      status: !dados.dominioCustomCadastrado ? "PENDENTE" : dados.dominioCustomAtivo ? "CONCLUIDO" : "EM_ANDAMENTO",
    },
    { chave: "email_configurado", label: "E-mail configurado", status: dados.emailDomainCadastrado ? "CONCLUIDO" : "PENDENTE" },
    {
      chave: "email_verificado",
      label: "E-mail verificado",
      status: !dados.emailDomainCadastrado ? "PENDENTE" : dados.emailDomainVerificado ? "CONCLUIDO" : "EM_ANDAMENTO",
    },
    {
      chave: "pronta_para_publicacao",
      label: "Organização pronta para publicação",
      status: publicationStatus === "PRONTO" ? "CONCLUIDO" : "PENDENTE",
    },
  ];

  return { itens, publicationStatus };
}

// Checklist de onboarding (P.10.7) — 100% CALCULADO a partir de dados já
// existentes, nenhum campo novo persistido pra "status de onboarding"
// (ver P.10.7.1: "preferência: calcular automaticamente o máximo
// possível"). Uma única leitura batched (Promise.all) — nunca N+1 (ver
// P.10.15).
export async function resolverOnboarding(organizationId: string): Promise<Onboarding> {
  const [organization, ownerMember, branding, dominios, emailDomain] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { planId: true } }),
    prisma.organizationMember.findFirst({ where: { organizationId, role: "OWNER" }, select: { status: true } }),
    prisma.organizationBranding.findUnique({ where: { organizationId } }),
    prisma.organizationDomain.findMany({ where: { organizationId }, select: { type: true, status: true } }),
    prisma.organizationEmailDomain.findUnique({ where: { organizationId }, select: { status: true } }),
  ]);

  const dominioCustom = dominios.find((d) => d.type === "CUSTOM") ?? null;

  return calcularOnboarding({
    organizacaoExiste: organization !== null,
    planoSelecionado: Boolean(organization?.planId),
    ownerExiste: ownerMember !== null,
    ownerAtivo: ownerMember?.status === "ACTIVE",
    brandingConfigurado: branding !== null,
    dominioCustomCadastrado: dominioCustom !== null,
    dominioCustomVerificado: dominioCustom ? dominioCustom.status === "VERIFIED" || dominioCustom.status === "ACTIVE" : false,
    dominioCustomAtivo: dominioCustom ? dominioCustom.status === "ACTIVE" : false,
    emailDomainCadastrado: emailDomain !== null,
    emailDomainVerificado: emailDomain ? emailDomain.status === "VERIFIED" || emailDomain.status === "ACTIVE" : false,
  });
}
