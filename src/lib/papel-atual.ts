import { auth } from "@/lib/auth";
import { buscarEstadoDaSessao } from "@/lib/tenant";

// =======================================================================
// Papel EFETIVO da sessão (Fase 27)
// =======================================================================
// A doutrina, que até aqui estava só metade implementada:
//
//   O JWT carrega CONTEXTO para a UX.
//   O JWT NÃO é autoridade de privilégio.
//
// A Fase 25 passou a revalidar, a cada requisição, se o vínculo ainda
// está ACTIVE e se a senha não mudou. O PAPEL, porém, continuava sendo
// lido do token — e toda autorização do produto (28 pontos, incluindo
// sete arquivos de action) chamava `temPapel(session.user.role, ...)`.
//
// A consequência era concreta e silenciosa: rebaixar um OWNER para
// BROKER não tirava privilégio nenhum. A pessoa seguia administrando
// usuários, configurações e catálogos com o token que já tinha, por até
// 30 dias, sem nada na tela indicar isso. Revogar acesso parcial
// simplesmente não funcionava.
//
// Esta função lê o papel do MESMO registro que requireOrganizationId já
// carrega por requisição (React cache()), então o custo é zero consulta
// adicional. Nenhum cache persistente é introduzido: autorização nunca
// atravessa requisições.
export async function papelAtual(): Promise<string | undefined> {
  const session = await auth();
  const organizationId = session?.user?.organizationId;
  const userId = session?.user?.id;
  if (!organizationId || !userId) return undefined;

  const estado = await buscarEstadoDaSessao(organizationId, userId);
  // Vínculo inexistente ou não-ativo não tem papel nenhum: quem perdeu o
  // acesso não conserva capacidade. requireOrganizationId já expulsa
  // esses casos; aqui a resposta é undefined para que qualquer
  // verificação de papel falhe fechado mesmo fora daquele portão.
  if (!estado || estado.status !== "ACTIVE") return undefined;
  return estado.role;
}
