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
