import { auth } from "@/lib/auth";
import { buscarVisibilidadeComercial } from "@/lib/visibilidade-comercial";
import { resolverEscopoComercial, type EscopoComercial } from "@/lib/escopo-comercial";

// Resolve o escopo comercial da SESSÃO (Fase 22).
//
// Único ponto que junta política + papel + membro. Existe para que
// nenhuma página e nenhuma action precise repetir essa combinação — e
// para que o `role` e o `memberId` venham SEMPRE da sessão do servidor,
// nunca do cliente.
//
// Recebe organizationId de quem já chamou requireOrganizationId(), que é
// quem estabelece o tenant. Este helper não decide tenant: decide o
// escopo DENTRO dele.
export async function escopoComercialDaSessao(organizationId: string): Promise<EscopoComercial> {
  const [politica, session] = await Promise.all([
    buscarVisibilidadeComercial(organizationId),
    auth(),
  ]);
  return resolverEscopoComercial({
    politica,
    role: session?.user.role,
    memberId: session?.user.organizationMemberId ?? null,
  });
}
