"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verificarTokenReset, consumirTokenReset } from "@/lib/acesso-token";
import { CUSTO_BCRYPT, senhaSchema } from "@/lib/senha";
import { logActivity } from "@/lib/activity-log";
import { type ActionState, erroGenerico, erroValidacao } from "@/lib/action-result";

const novaSenhaSchema = z.object({ senha: senhaSchema });

// =======================================================================
// Redefinir a senha (Fase 25)
// =======================================================================
// Não pede a senha antiga: quem chegou aqui provou identidade com um
// segredo entregue no e-mail da conta, e exigir a senha antiga de quem a
// esqueceu tornaria a recuperação inútil.
export async function redefinirSenha(
  token: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Revalida no servidor mesmo tendo a página já validado — a action é
  // uma superfície própria e não confia no que veio antes dela.
  const resultado = await verificarTokenReset(token);
  if (!resultado.valido) {
    return erroGenerico("Este link é inválido, já foi usado ou expirou.");
  }

  const parsed = novaSenhaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);

  const senhaHash = await bcrypt.hash(parsed.data.senha, CUSTO_BCRYPT);
  const agora = new Date();

  const efetivado = await prisma.$transaction(async (tx) => {
    // CONSUMO PRIMEIRO, com guarda atômica. Duas requisições com o mesmo
    // token: só uma casa `usedAt: null`, a outra sai sem trocar senha
    // nenhuma. É isto que torna o replay impossível — não a checagem de
    // leitura acima, que é apenas cortesia para a UI.
    if (!(await consumirTokenReset(tx, resultado.tokenId))) return false;

    await tx.user.update({
      where: { id: resultado.userId },
      data: {
        passwordHash: senhaHash,
        // passwordChangedAt é o que derruba sessões emitidas antes desta
        // troca (ver requireOrganizationId). Sem ele, quem roubou a
        // senha continuaria dentro depois de a vítima trocá-la.
        passwordChangedAt: agora,
      },
    });

    // Qualquer OUTRO pedido de recuperação em aberto morre junto: se
    // duas mensagens foram pedidas, usar uma tem de invalidar a outra.
    await tx.passwordResetToken.deleteMany({
      where: { userId: resultado.userId, usedAt: null },
    });

    return true;
  });

  if (!efetivado) {
    return erroGenerico("Este link é inválido, já foi usado ou expirou.");
  }

  // Trilha por organização, porque ActivityLog é por tenant e não existe
  // trilha global. Só vínculos ATIVOS: a organização onde a pessoa
  // trabalha tem interesse legítimo em saber que a senha dela mudou.
  // Nenhum e-mail, nenhum token, nenhum hash entra no payload.
  const vinculos = await prisma.organizationMember.findMany({
    where: { userId: resultado.userId, status: "ACTIVE" },
    select: { organizationId: true },
  });
  for (const vinculo of vinculos) {
    await logActivity({
      organizationId: vinculo.organizationId,
      userId: resultado.userId,
      entity: "User",
      entityId: resultado.userId,
      action: "password_reset_completed",
    });
  }

  // Destino FIXO. Nenhum parâmetro de retorno é aceito nem lido em
  // lugar nenhum deste fluxo, então não existe superfície de open
  // redirect para proteger — a proteção é não ter o parâmetro.
  redirect("/app/login?senha=redefinida");
}
