"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verificarConvite, consumirConvite } from "@/lib/acesso-token";
import { CUSTO_BCRYPT, senhaSchema } from "@/lib/senha";
import { logActivity } from "@/lib/activity-log";
import { type ActionState, erroGenerico, erroValidacao } from "@/lib/action-result";

const definirSenhaSchema = z.object({ senha: senhaSchema });

// Aceitação de convite (Fase 25 — antes, só do primeiro OWNER).
//
// Dois caminhos, decididos pelo estado da IDENTIDADE, não do vínculo:
//
//   User.active === false  -> nunca ativou nenhuma conta: define senha.
//   User.active === true   -> já tem credencial própria (é membro de
//                             outra organização): apenas ACEITA o
//                             vínculo. Obrigá-lo a criar uma senha nova
//                             para entrar numa segunda imobiliária seria
//                             confundir identidade com autorização — e
//                             ainda daria a quem convida o poder de
//                             forçar troca de senha alheia.
export async function definirSenhaConvite(
  token: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Reverifica no SERVIDOR (não confia na checagem já feita em
  // page.tsx) — uma Server Action pode em tese ser chamada fora do
  // fluxo normal da página. Mesma mensagem genérica para inexistente,
  // expirado ou já usado.
  const resultado = await verificarConvite(token);
  if (!resultado.valido) return erroGenerico("Convite inválido ou expirado.");

  const usuario = await prisma.user.findUnique({
    where: { id: resultado.userId },
    select: { active: true },
  });
  if (!usuario) return erroGenerico("Convite inválido ou expirado.");

  // Só exige e só aceita senha quem ainda não tem identidade ativa.
  let senhaHash: string | null = null;
  if (!usuario.active) {
    const parsed = definirSenhaSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return erroValidacao(parsed.error);
    senhaHash = await bcrypt.hash(parsed.data.senha, CUSTO_BCRYPT);
  }

  // Tudo numa transaction, com o CONSUMO DO TOKEN como primeira
  // operação: se duas requisições chegarem juntas, só uma casa a guarda
  // `usedAt: null` e a outra sai sem efeito nenhum.
  const efetivado = await prisma.$transaction(async (tx) => {
    if (!(await consumirConvite(tx, resultado.tokenId))) return false;

    if (senhaHash) {
      await tx.user.update({
        where: { id: resultado.userId },
        data: { passwordHash: senhaHash, active: true, passwordChangedAt: new Date() },
      });
    }
    // updateMany, não update: a chave natural aqui é (organização,
    // usuário), e o vínculo só é ativado se ainda existir — um admin
    // que revogou o convite no meio do caminho não é sobrescrito.
    await tx.organizationMember.updateMany({
      where: {
        organizationId: resultado.organizationId,
        userId: resultado.userId,
        status: "INVITED",
      },
      data: { status: "ACTIVE" },
    });
    return true;
  });

  if (!efetivado) return erroGenerico("Convite inválido ou expirado.");

  // Trilha sem PII: ids, nunca e-mail ou nome.
  await logActivity({
    organizationId: resultado.organizationId,
    userId: resultado.userId,
    entity: "OrganizationMember",
    action: "member_invite_accepted",
  });

  redirect("/app/login?convite=ativado");
}
