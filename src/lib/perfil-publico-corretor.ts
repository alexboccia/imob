// Resolução da identidade comercial pública de um imóvel: qual
// profissional (se algum) pode ser mostrado no site, e qual número de
// WhatsApp o CTA deve usar.
//
// Existe como função única, e não como `if` espalhado pelos componentes,
// porque a regra é de PRIVACIDADE e precisa ter um lugar só onde possa
// ser lida, testada e auditada. A regra:
//
//   publicação é opt-in explícito (publicProfileEnabled).
//
// Nada mais publica um membro — nem ser OWNER/ADMIN, nem ser o
// responsável pelo imóvel, nem ter WhatsApp, avatar ou nome preenchidos.
// Com a flag desligada, os dados continuam guardados (dá pra preparar um
// perfil antes de publicar) mas o site se comporta como se o membro não
// existisse: cai na identidade institucional da organização.
import { temWhatsApp } from "@/lib/whatsapp";
import { normalizarTelefone, telefoneValido } from "@/lib/telefone";

// O que a página lê do banco. Espelha o `select` usado no detalhe do
// imóvel — o e-mail de login e o contato operacional (whatsapp,
// contactEmail) nunca entram aqui, então não há caminho por onde vazarem
// pra camada de renderização.
export type MembroResponsavel = {
  publicProfileEnabled: boolean;
  publicCreci: string | null;
  publicPhotoUrl: string | null;
  publicBio: string | null;
  publicWhatsapp: string | null;
  publicPhone: string | null;
  publicEmail: string | null;
  user: { name: string };
} | null | undefined;

// Identidade profissional já pronta pra renderizar. `nome` é
// User.name — o nome real do profissional, reutilizado SÓ depois do
// opt-in, em vez de duplicar um "nome público" que ninguém manteria
// sincronizado.
export type CorretorPublico = {
  nome: string;
  creci: string | null;
  foto: string | null;
  bio: string | null;
};

// Contatos que o profissional publicou — e SÓ eles. Cada um é null
// quando não foi preenchido, e o botão correspondente simplesmente não
// existe. Nenhum deles cai no contato institucional: um botão ao lado do
// rosto de alguém precisa falar com aquela pessoa (ver
// whatsappPublicoDoCorretor, mesma doutrina).
export type ContatosPublicosCorretor = {
  /** Dígitos locais (10-11), como telefoneValido define. Sem DDI. */
  telefone: string | null;
  email: string | null;
  whatsapp: string | null;
};

export function resolverCorretorPublico(membro: MembroResponsavel): CorretorPublico | null {
  if (!membro?.publicProfileEnabled) return null;
  // Consistência técnica mínima pra publicar: sem nome não há o que
  // apresentar, e um card com CRECI e foto sem nome seria pior que nenhum.
  const nome = membro.user.name.trim();
  if (!nome) return null;

  return {
    nome,
    creci: membro.publicCreci?.trim() || null,
    foto: membro.publicPhotoUrl?.trim() || null,
    bio: membro.publicBio?.trim() || null,
  };
}

// Qual número o CTA de WhatsApp do imóvel deve usar. Ordem:
//
// 1. WhatsApp PÚBLICO do corretor, e só quando o perfil está publicado —
//    o campo operacional OrganizationMember.whatsapp nunca é usado aqui,
//    porque um número cadastrado pra equipe usar internamente não é
//    consentimento pra aparecer no site (antes desta fase ele era, e essa
//    era a exposição que esta função fecha).
// 2. WhatsApp institucional da organização.
// 3. Nenhum — e aí a página não renderiza CTA de WhatsApp nenhum; o
//    formulário de contato continua sendo o canal.
export function resolverWhatsAppDoImovel(
  membro: MembroResponsavel,
  whatsappOrganizacao: string | null | undefined
): string | null {
  if (membro?.publicProfileEnabled && temWhatsApp(membro.publicWhatsapp)) {
    return membro.publicWhatsapp!;
  }
  if (temWhatsApp(whatsappOrganizacao)) return whatsappOrganizacao!;
  return null;
}

// WhatsApp DO CORRETOR — deliberadamente diferente de
// resolverWhatsAppDoImovel acima, e a diferença é de honestidade, não de
// implementação.
//
// Aquela função responde "qual número o CTA do IMÓVEL deve usar" e, por
// isso, cai no número institucional quando o corretor não tem um. Aqui a
// pergunta é outra: "este profissional, cujo rosto e nome estão neste
// card, pode ser contatado diretamente?". Um botão ao lado da foto de uma
// pessoa que abre conversa com o número da imobiliária afirmaria que o
// visitante está falando com ELA — e não estaria. Sem número próprio
// publicado, o botão simplesmente não existe, e o CTA institucional do
// card lateral continua sendo o caminho.
export function whatsappPublicoDoCorretor(membro: MembroResponsavel): string | null {
  if (!membro?.publicProfileEnabled) return null;
  return temWhatsApp(membro.publicWhatsapp) ? membro.publicWhatsapp!.trim() : null;
}

// URL pública do perfil de um corretor. Um lugar só: a ficha do imóvel
// monta o link do card e a própria página monta o canonical e a entrada
// de sitemap — se cada um concatenasse o caminho, uma mudança de rota
// quebraria silenciosamente os outros dois.
//
// O identificador é o `OrganizationMember.id` (cuid), e não um slug novo,
// porque é exatamente a convenção que este produto já usa em URL pública:
// /imoveis/{Property.id} é um cuid desde sempre. Um slug legível seria
// melhor para SEO, mas exigiria coluna nova, unicidade por organização,
// regeneração ao renomear e uma tela para administrar isso — schema e
// painel que esta fase não pediu. Fica registrado como dívida.
//
// O id não é dado privado: não é e-mail, não é credencial e não revela
// nada sobre a pessoa. E ele sozinho não abre nada — a página busca o
// membro SEMPRE escopada pela organização do orgSlug, então o id de um
// membro de outra organização simplesmente não encontra ninguém.
export function caminhoPerfilCorretor(basePath: string, membroId: string): string {
  return `${basePath}/corretores/${membroId}`;
}

/**
 * Telefone público do corretor, em dígitos locais. Só com opt-in.
 *
 * A normalização é a do CRM (normalizarTelefone: dígitos, sem inventar
 * DDI) e NÃO a do WhatsApp — os dois formatos são diferentes de
 * propósito: wa.me exige DDI, um `tel:` brasileiro não. Reaproveitar a
 * normalização de um no outro produziria link quebrado em um dos dois.
 */
export function telefonePublicoDoCorretor(membro: MembroResponsavel): string | null {
  if (!membro?.publicProfileEnabled) return null;
  const digitos = membro.publicPhone ? normalizarTelefone(membro.publicPhone) : null;
  return digitos && telefoneValido(digitos) ? digitos : null;
}

/** E-mail público do corretor. Só com opt-in; nunca o e-mail de login. */
export function emailPublicoDoCorretor(membro: MembroResponsavel): string | null {
  if (!membro?.publicProfileEnabled) return null;
  return membro.publicEmail?.trim() || null;
}

/**
 * Os três contatos de uma vez, para quem renderiza botões. Não existe
 * "contato do corretor" fora daqui: card e perfil leem a mesma função,
 * então não há como um deles esquecer o portão de publicação.
 */
export function contatosPublicosDoCorretor(
  membro: MembroResponsavel
): ContatosPublicosCorretor {
  return {
    telefone: telefonePublicoDoCorretor(membro),
    email: emailPublicoDoCorretor(membro),
    whatsapp: whatsappPublicoDoCorretor(membro),
  };
}

/** href de discagem. Sem DDI inventado — o campo guarda número local. */
export function hrefTelefone(digitos: string | null): string | null {
  return digitos ? `tel:${digitos}` : null;
}

/** href de e-mail. Sem assunto/corpo: nada sensível em query string. */
export function hrefEmail(email: string | null): string | null {
  return email ? `mailto:${email}` : null;
}
