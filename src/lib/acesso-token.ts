import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";

// =======================================================================
// Segredos de acesso: convite e recuperação de senha (Fase 25)
// =======================================================================
// Era src/lib/platform/invite.ts, exclusivo do convite do primeiro
// OWNER. Saiu de platform/ porque deixou de ser assunto do Super Admin:
// a mesma mecânica agora serve o convite de qualquer membro e a
// recuperação de senha de qualquer usuário.
//
// O que NÃO mudou, e é o coração disto: o token bruto existe apenas em
// memória e no e-mail. O banco guarda somente o sha256.

// Convite: 7 DIAS. Uma pessoa recém-contratada pode receber o e-mail
// numa sexta e só configurar a conta na segunda; janela curta demais
// transformaria convite em trabalho repetido para quem convida.
const EXPIRACAO_CONVITE_DIAS = 7;

// Recuperação: 60 MINUTOS. Prazo deliberadamente muito mais curto que o
// do convite, porque o risco é outro: aqui o segredo abre uma conta que
// JÁ EXISTE e já tem dados dentro. Quem pediu o reset está, por
// definição, na frente do computador agora — não precisa de dias.
const EXPIRACAO_RESET_MINUTOS = 60;

// 256 bits de randomBytes — CSPRNG do sistema. Nunca Math.random, nunca
// UUID (que carrega estrutura e menos entropia efetiva), nunca timestamp.
export function gerarTokenAcesso(): string {
  return randomBytes(32).toString("base64url");
}

// sha256 completo (64 hex) — deliberadamente NÃO reusa hashCurto()
// (@/lib/hash.ts, 12 chars, feito para correlação em log, curto demais
// para segurança de token).
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function expiracaoConvite(): Date {
  return new Date(Date.now() + EXPIRACAO_CONVITE_DIAS * 24 * 60 * 60 * 1000);
}

export function expiracaoReset(): Date {
  return new Date(Date.now() + EXPIRACAO_RESET_MINUTOS * 60 * 1000);
}

// Cadastro de imobiliária: 24 HORAS. Entre o do convite (7 dias) e o da
// recuperação (60 min), e por um motivo próprio: o slug pretendido NÃO
// fica reservado enquanto o token vive — quem confirmar primeiro leva.
// Uma janela longa aumentaria a chance de alguém confirmar e descobrir
// que o endereço foi tomado no meio do caminho; uma janela curta demais
// puniria quem só lê e-mail à noite.
const EXPIRACAO_CADASTRO_HORAS = 24;

export function expiracaoCadastro(): Date {
  return new Date(Date.now() + EXPIRACAO_CADASTRO_HORAS * 60 * 60 * 1000);
}

// Os links são montados a partir de NEXT_PUBLIC_SITE_URL (getSiteUrl),
// NUNCA do Host/X-Forwarded-Host da requisição. É o que fecha
// host-header poisoning: um atacante que force `Host: evil.test` num
// pedido de recuperação não consegue fazer o e-mail apontar para o
// domínio dele — a aplicação nem lê esse cabeçalho aqui.
export function linkConvite(token: string): string {
  return getSiteUrl(`/app/convite/${token}`);
}

export function linkRedefinicao(token: string): string {
  return getSiteUrl(`/app/redefinir-senha/${token}`);
}

export function linkCadastro(token: string): string {
  return getSiteUrl(`/cadastro/${token}`);
}

export type ResultadoConvite =
  | { valido: true; tokenId: string; userId: string; organizationId: string }
  | { valido: false };

// Usado pela página pública de aceitação — SEM contexto de tenant ainda
// (o usuário nem logou). Sempre o MESMO formato de "inválido" para token
// inexistente, expirado ou já usado: distinguir os três diria a um
// atacante que o token existe, só chegou tarde.
export async function verificarConvite(token: string): Promise<ResultadoConvite> {
  const registro = await prisma.inviteToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
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

export type ResultadoReset =
  | { valido: true; tokenId: string; userId: string }
  | { valido: false };

export async function verificarTokenReset(token: string): Promise<ResultadoReset> {
  const registro = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!registro || registro.usedAt || registro.expiresAt < new Date()) {
    return { valido: false };
  }
  return { valido: true, tokenId: registro.id, userId: registro.userId };
}

// CONSUMO ATÔMICO — o coração da garantia de uso único.
//
// A versão anterior (consumirConvite) fazia `update` por id, sem guarda:
// duas requisições com o mesmo token passavam ambas pela verificação e
// ambas escreviam. A janela era pequena, mas era real.
//
// updateMany com `usedAt: null` no where faz o Postgres decidir: só uma
// linha casa, e a segunda chamada recebe count 0. Quem chama roda isto
// DENTRO da transaction que faz o resto do trabalho, para que "consumir"
// e "efetivar" sejam a mesma operação indivisível.
type ClientePrisma = Pick<
  typeof prisma,
  "inviteToken" | "passwordResetToken" | "signupToken"
>;

export async function consumirConvite(tx: ClientePrisma, tokenId: string): Promise<boolean> {
  const { count } = await tx.inviteToken.updateMany({
    where: { id: tokenId, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}

export async function consumirTokenReset(tx: ClientePrisma, tokenId: string): Promise<boolean> {
  const { count } = await tx.passwordResetToken.updateMany({
    where: { id: tokenId, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}

export type ResultadoCadastro =
  | {
      valido: true;
      tokenId: string;
      email: string;
      orgName: string;
      orgSlug: string;
      ownerName: string;
    }
  | { valido: false };

// Mesma disciplina dos outros dois: inexistente, expirado e já usado
// devolvem o MESMO "inválido". Distingui-los diria a quem tem o link se
// ele já valeu um dia.
export async function verificarCadastro(token: string): Promise<ResultadoCadastro> {
  const registro = await prisma.signupToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!registro || registro.usedAt || registro.expiresAt < new Date()) {
    return { valido: false };
  }
  return {
    valido: true,
    tokenId: registro.id,
    email: registro.email,
    orgName: registro.orgName,
    orgSlug: registro.orgSlug,
    ownerName: registro.ownerName,
  };
}

export async function consumirCadastro(
  tx: ClientePrisma,
  tokenId: string
): Promise<boolean> {
  const { count } = await tx.signupToken.updateMany({
    where: { id: tokenId, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}
