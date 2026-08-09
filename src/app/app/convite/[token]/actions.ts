"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verificarConvite, consumirConvite } from "@/lib/platform/invite";
import { type ActionState, erroGenerico, erroValidacao } from "@/lib/action-result";

const definirSenhaSchema = z.object({
  senha: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
});

// Reverifica o token no SERVIDOR (não confia na checagem já feita em
// page.tsx) — defense in depth, uma Server Action pode em tese ser
// chamada fora do fluxo normal da página. Mesma mensagem genérica de
// "inválido ou expirado" pra token inexistente, expirado ou já usado.
export async function definirSenhaConvite(
  token: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const resultado = await verificarConvite(token);
  if (!resultado.valido) {
    return erroGenerico("Convite inválido ou expirado.");
  }

  const parsed = definirSenhaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);

  const senhaHash = await bcrypt.hash(parsed.data.senha, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resultado.userId },
      data: { passwordHash: senhaHash, active: true },
    }),
    prisma.organizationMember.updateMany({
      where: { organizationId: resultado.organizationId, userId: resultado.userId },
      data: { status: "ACTIVE" },
    }),
  ]);

  await consumirConvite(resultado.tokenId);

  redirect("/app/login?convite=ativado");
}
