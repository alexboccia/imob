import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Token de convite pro primeiro OWNER definir a própria senha — o Super
// Admin nunca define nem vê a senha permanente do cliente. Ver plano em
// /Users/alexboccia/.claude/plans/glittery-noodling-harp.md, decisão #6.
const EXPIRACAO_DIAS = 7;

// 256 bits de entropia, nunca persistido — só o hash (ver hashToken) vai
// pro banco (OwnerInviteToken.tokenHash).
export function gerarTokenConvite(): string {
  return randomBytes(32).toString("base64url");
}

// sha256 completo (64 hex) — deliberadamente NÃO reusa hashCurto()
// (@/lib/hash.ts, 12 chars, feito pra correlação em log, curto demais pra
// segurança de token).
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function expiracaoConvite(): Date {
  return new Date(Date.now() + EXPIRACAO_DIAS * 24 * 60 * 60 * 1000);
}

export type ResultadoConvite =
  | { valido: true; tokenId: string; userId: string; organizationId: string }
  | { valido: false };

// Usado pela página pública de aceitação (/app/convite/[token]) — SEM
// contexto de tenant estabelecido ainda (o usuário nem logou). Sempre
// retorna o mesmo formato de "inválido" pra token inexistente, expirado
// ou já usado — nunca diferencia, pra não vazar informação sobre qual
// desses três casos é o real.
export async function verificarConvite(token: string): Promise<ResultadoConvite> {
  const tokenHash = hashToken(token);
  const registro = await prisma.ownerInviteToken.findUnique({ where: { tokenHash } });

  if (!registro || registro.usedAt || registro.expiresAt < new Date()) {
    return { valido: false };
  }

  return {
    valido: true,
    tokenId: registro.id,
    userId: registro.userId,
    organizationId: registro.organizationId,
  };
}

export async function consumirConvite(tokenId: string): Promise<void> {
  await prisma.ownerInviteToken.update({
    where: { id: tokenId },
    data: { usedAt: new Date() },
  });
}
