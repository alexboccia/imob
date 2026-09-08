"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { obterIpCliente } from "@/lib/client-ip";
import { obterKvStore } from "@/lib/kv-store";
import { normalizarEmail, verificarLimiteRecuperacaoSenha } from "@/lib/rate-limit";
import {
  gerarTokenAcesso,
  hashToken,
  expiracaoReset,
  linkRedefinicao,
} from "@/lib/acesso-token";
import { enviarEmailRecuperacaoSenha } from "@/lib/email";

// =======================================================================
// Pedir recuperação de senha (Fase 25)
// =======================================================================
// A regra que governa esta action inteira:
//
//   A RESPOSTA PÚBLICA É SEMPRE A MESMA.
//
// E-mail cadastrado, e-mail inexistente, conta nunca ativada, envio que
// falhou, limite de abuso atingido — tudo devolve o mesmo texto. Um
// formulário de recuperação que responde diferente para e-mail existente
// é um oráculo de contas: qualquer pessoa descobre quem usa o produto.
//
// Por isso a função não tem caminho de erro visível. O que ela decide em
// silêncio é apenas SE cria um token e envia um e-mail.
export type EstadoRecuperacao = { enviado: boolean };

const emailSchema = z.string().email();

export async function pedirRecuperacaoSenha(
  _prevState: EstadoRecuperacao,
  formData: FormData
): Promise<EstadoRecuperacao> {
  const bruto = formData.get("email");
  const email = typeof bruto === "string" ? normalizarEmail(bruto) : null;

  // Mesmo um e-mail sintaticamente inválido devolve "enviado": dizer
  // "e-mail inválido" já separa o espaço de busca de um atacante.
  const emailValido = email && emailSchema.safeParse(email).success ? email : null;

  const store = obterKvStore();
  if (store) {
    const ip = obterIpCliente(await headers());
    const limite = await verificarLimiteRecuperacaoSenha(store, {
      ip,
      emailNormalizado: emailValido,
    });
    // Bloqueio também responde "enviado". Um 429 visível aqui contaria
    // ao atacante que ele acertou o alvo do balde por e-mail.
    if (!limite.permitido) return { enviado: true };
  }

  if (emailValido) await criarEEnviarRecuperacao(emailValido);

  return { enviado: true };
}

async function criarEEnviarRecuperacao(email: string): Promise<void> {
  const usuario = await prisma.user.findUnique({
    where: { email },
    select: { id: true, active: true, email: true },
  });

  // `active: false` = identidade que nunca foi ativada (convite ainda
  // pendente). Não há senha a recuperar, e o caminho correto para essa
  // pessoa é o convite. Nada é criado, nada é enviado — e, de fora, é
  // indistinguível de um e-mail que não existe.
  if (!usuario || !usuario.active) return;

  // Deliberadamente NÃO se olha o status das memberships aqui.
  // Autenticação é global; autorização é do vínculo. Um membro suspenso
  // numa imobiliária pode ser membro ativo de outra, e mesmo que não
  // seja, recuperar a senha não devolve acesso nenhum: auth.ts continua
  // exigindo membership ACTIVE para deixar entrar.
  const token = gerarTokenAcesso();

  // Pedido novo invalida os anteriores: nunca dois links de recuperação
  // válidos ao mesmo tempo para a mesma conta. Quem pediu duas vezes usa
  // o e-mail mais recente, que é o que qualquer pessoa faria.
  await prisma.$transaction(async (tx) => {
    // Mesmo lock de linha do reenvio de convite, pelo mesmo motivo: dois
    // pedidos simultâneos deixariam dois links vivos. A linha do usuário
    // é o mutex — SELECT ... FOR UPDATE não altera nada, só serializa.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${usuario.id} FOR UPDATE`;
    await tx.passwordResetToken.deleteMany({
      where: { userId: usuario.id, usedAt: null },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: usuario.id,
        tokenHash: hashToken(token),
        expiresAt: expiracaoReset(),
      },
    });
  });

  // Fora da transaction: nenhuma conexão do pool fica presa esperando
  // rede de terceiro. Se o envio falhar, o token existe e simplesmente
  // não será usado — expira em 60 minutos. Nenhuma conta é corrompida,
  // nada é revelado, e a pessoa pode pedir de novo.
  await enviarEmailRecuperacaoSenha({
    para: usuario.email,
    linkRedefinicao: linkRedefinicao(token),
  });
}
