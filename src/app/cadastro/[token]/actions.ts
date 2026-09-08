"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verificarCadastro, consumirCadastro } from "@/lib/acesso-token";
import { CUSTO_BCRYPT, senhaSchema } from "@/lib/senha";
import { bootstrapOrganizacao } from "@/lib/bootstrap-organizacao";
import { derivarSlug } from "@/lib/slug-organizacao";
import { logActivity } from "@/lib/activity-log";
import { type ActionState, erroGenerico, erroValidacao } from "@/lib/action-result";

// Plano do self-service, resolvido POR CÓDIGO no servidor. Jamais vem do
// browser: aceitar planId do formulário deixaria qualquer pessoa criar
// uma organização no plano mais caro, com todos os módulos, de graça.
const CODIGO_PLANO_SELF_SERVICE = "STARTER";

const confirmarSchema = z.object({ senha: senhaSchema });

// =======================================================================
// Confirmação do cadastro (Fase 26)
// =======================================================================
// É AQUI que a organização nasce, e só aqui. Quem chegou até este ponto
// provou posse do e-mail declarado — que é a única prova de identidade
// que o produto tem antes de existir qualquer conta.
//
// Dois caminhos, decididos pelo estado da IDENTIDADE (mesma doutrina da
// aceitação de convite, Fase 25):
//
//   identidade nova       -> define a senha agora;
//   identidade já ativa   -> não toca na senha dela. Abrir uma segunda
//                            imobiliária não é motivo para trocar a
//                            credencial de ninguém.
export async function confirmarCadastro(
  token: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Revalida no servidor mesmo tendo a página validado: a action é uma
  // superfície própria e não confia no que veio antes dela.
  const cadastro = await verificarCadastro(token);
  if (!cadastro.valido) {
    return erroGenerico("Este link é inválido, já foi usado ou expirou.");
  }

  const usuarioExistente = await prisma.user.findUnique({
    where: { email: cadastro.email },
    select: { id: true, active: true },
  });
  const precisaDefinirSenha = !usuarioExistente?.active;

  let senhaHash: string | null = null;
  if (precisaDefinirSenha) {
    const parsed = confirmarSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return erroValidacao(parsed.error);
    senhaHash = await bcrypt.hash(parsed.data.senha, CUSTO_BCRYPT);
  }

  // O plano é buscado por CÓDIGO e precisa estar ativo. Se o operador da
  // plataforma desativou o plano de entrada, o cadastro para aqui em vez
  // de criar uma organização num plano que não deveria mais existir.
  const plano = await prisma.plan.findUnique({
    where: { code: CODIGO_PLANO_SELF_SERVICE },
    select: { id: true, active: true, isTrial: true, trialDays: true },
  });
  if (!plano || !plano.active) {
    return erroGenerico(
      "Não foi possível concluir o cadastro agora. Tente novamente em alguns minutos."
    );
  }

  // O slug é RECALCULADO do nome guardado, nunca lido cru da linha: se
  // as regras de derivação mudarem entre o pedido e a confirmação, vale
  // a regra atual, e não um valor congelado que talvez já não seja
  // aceitável como rota.
  const resultadoSlug = derivarSlug(cadastro.orgName);
  if (!resultadoSlug.valido) {
    return erroGenerico("O nome da imobiliária não pode ser usado como endereço do site.");
  }

  let criado: { organizationId: string; userId: string } | null = null;
  try {
    criado = await prisma.$transaction(async (tx) => {
      // CONSUMO PRIMEIRO, com guarda atômica. Duplo clique, retry do
      // navegador ou dois cliques no link do e-mail: só uma requisição
      // casa `usedAt: null`, e as outras não criam organização nenhuma.
      // É isto que torna o bootstrap idempotente do ponto de vista de
      // quem clica.
      if (!(await consumirCadastro(tx, cadastro.tokenId))) return null;

      const resultado = await bootstrapOrganizacao(tx, {
        nomeOrganizacao: cadastro.orgName,
        slug: resultadoSlug.slug,
        plano: { id: plano.id, isTrial: plano.isTrial, trialDays: plano.trialDays },
        nomeResponsavel: cadastro.ownerName,
        emailResponsavel: cadastro.email,
        // ACTIVE, e não INVITED: a posse do e-mail já foi provada para
        // chegar até aqui. Pedir uma segunda confirmação do mesmo
        // endereço seria cerimônia sem ganho de segurança.
        statusVinculo: "ACTIVE",
      });

      if (senhaHash) {
        // Identidade nova (ou nunca ativada): ganha a senha escolhida
        // agora e passa a valer. passwordChangedAt fica nulo de
        // propósito — não houve TROCA, houve definição inicial, e
        // marcá-lo derrubaria sessões que nem existem.
        await tx.user.update({
          where: { id: resultado.userId },
          data: { passwordHash: senhaHash, active: true },
        });
      }

      return { organizationId: resultado.organizationId, userId: resultado.userId };
    });
  } catch (erro) {
    // Slug tomado entre o pedido e a confirmação é o caso esperado aqui:
    // a unique constraint é a última defesa, e ela funcionou. A
    // transação inteira reverteu — nenhuma organização, nenhuma
    // subscription, nenhum vínculo pela metade.
    const codigo =
      erro && typeof erro === "object" && "code" in erro ? String(erro.code) : null;
    if (codigo === "P2002") {
      return erroGenerico(
        "Esse endereço de site acabou de ser usado por outra imobiliária. Comece o cadastro de novo com um nome diferente."
      );
    }
    throw erro;
  }

  if (!criado) {
    return erroGenerico("Este link é inválido, já foi usado ou expirou.");
  }

  // Trilha na organização recém-criada, sem PII: nome e slug são
  // públicos; e-mail não entra.
  await logActivity({
    organizationId: criado.organizationId,
    userId: criado.userId,
    entity: "Organization",
    entityId: criado.organizationId,
    action: "organization_created",
    payload: { slug: resultadoSlug.slug, origem: "self_service" },
  });

  redirect("/app/login?cadastro=concluido");
}
