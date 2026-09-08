import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolverEstadoAcessoOrganizacao } from "@/lib/entitlements";

// cache() por request: requireOrganizationId() é chamado várias vezes na
// mesma requisição (várias actions/componentes) — sem isso, cada chamada
// repetiria a mesma query de "a org ainda está ativa?".
const buscarStatusOrganization = cache(async (organizationId: string) => {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    select: { active: true },
  });
});

// Fase 25 — estado VIVO da identidade e do vínculo, uma vez por request.
//
// A sessão é JWT (src/lib/auth.config.ts): nada é persistido, então o
// token continua válido até expirar mesmo que, no meio do caminho, o
// vínculo tenha sido suspenso ou a senha trocada. Sem esta checagem:
//
//   - suspender um membro NÃO o expulsava. Ele seguia trabalhando com o
//     token que já tinha, até 30 dias;
//   - redefinir a senha não derrubava a sessão de quem a roubou — a
//     vítima trocava a chave e o invasor continuava dentro.
//
// Aqui é o lugar certo porque já é o portão por onde toda página e toda
// action autenticada de /app passa, e ele já revalida no banco (org
// ativa, trial). cache() por request mantém o custo em UMA consulta.
// Fase 27 — o `role` entrou nesta MESMA consulta, sem custo adicional.
// A Fase 25 revalidava status e identidade a cada requisição, mas o
// PAPEL continuava vindo do JWT: rebaixar alguém de OWNER para BROKER
// não tirava privilégio nenhum até a sessão expirar (até 30 dias).
// Toda autorização do produto lia `session.user.role`.
export const buscarEstadoDaSessao = cache(
  async (organizationId: string, userId: string) => {
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId, userId },
      select: {
        role: true,
        status: true,
        user: { select: { active: true, passwordChangedAt: true } },
      },
    });
    return membership;
  }
);

// Resolve o tenant da sessão autenticada (área /app). Redireciona pro
// login se não houver sessão, pra /app/suspenso se a organização foi
// suspensa pelo Super Admin (/platform), e pra /app/trial-expirado (Fase
// P.9) se a organização está num plano de trial (Plan.isTrial) cujo
// período (Subscription.currentPeriodEnd) já passou — nunca apaga/bloqueia
// dado, só a operação. Suspensão sempre tem prioridade sobre trial
// expirado (resolverEstadoAcesso, src/lib/entitlements.ts, já resolve essa
// ordem). Plano pago nunca é afetado por trial antigo (mesma função só
// reporta TRIAL_EXPIRADO quando plan.isTrial ainda é true). Cobre
// automaticamente toda action/page/rota que já chama esta função (upload
// incluso), sem precisar espalhar a checagem — mesmo racional já
// documentado pra suspensão. Ver plano em /Users/alexboccia/.claude/plans/
// glittery-noodling-harp.md, decisão #7.
export async function requireOrganizationId(): Promise<string> {
  return resolverTenantDaSessao({ bloquearPorTrial: true });
}

// Fase 27 — MESMA revalidação, sem o portão do trial.
//
// Existe para as superfícies de ASSINATURA: quando o trial expira, a
// operação para, mas a tela onde a pessoa entende o bloqueio e o
// regulariza não pode parar junto. Um trial que expira e leva embora o
// caminho de saída é um beco sem saída — a organização fica presa
// dependendo de alguém de dentro do easymob.
//
// Tudo o mais continua idêntico: identidade, vínculo ACTIVE, época da
// senha e organização suspensa seguem barrando. O que se afrouxa é
// apenas o motivo TRIAL_EXPIRADO, e apenas onde ele é o assunto da tela.
export async function requireOrganizationIdParaAssinatura(): Promise<string> {
  return resolverTenantDaSessao({ bloquearPorTrial: false });
}

async function resolverTenantDaSessao(opcoes: {
  bloquearPorTrial: boolean;
}): Promise<string> {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/app/login");

  const organization = await buscarStatusOrganization(session.user.organizationId);
  if (!organization || !organization.active) redirect("/app/suspenso");

  const estado = await buscarEstadoDaSessao(session.user.organizationId, session.user.id);
  // Vínculo que deixou de ser ACTIVE (suspenso, ou removido) e identidade
  // desativada acabam a sessão imediatamente, na próxima navegação.
  if (!estado || estado.status !== "ACTIVE" || !estado.user.active) {
    redirect("/app/login");
  }
  // Sessão emitida ANTES da última troca de senha não vale mais. null em
  // passwordChangedAt significa "nunca trocou": todo usuário existente no
  // dia do deploy cai neste caso e NENHUMA sessão em curso é derrubada.
  // A comparação é em segundos porque `iat` do JWT é em segundos.
  if (estado.user.passwordChangedAt && session.user.emitidaEm !== undefined) {
    const trocadaEm = Math.floor(estado.user.passwordChangedAt.getTime() / 1000);
    if (session.user.emitidaEm < trocadaEm) redirect("/app/login");
  }

  if (opcoes.bloquearPorTrial) {
    const estadoAcesso = await resolverEstadoAcessoOrganizacao(session.user.organizationId);
    if (estadoAcesso.bloqueado && estadoAcesso.motivo === "TRIAL_EXPIRADO") {
      redirect("/app/trial-expirado");
    }
  }

  return session.user.organizationId;
}

// Resolução do site público por slug de URL. cache() por request: várias
// pages/actions da mesma árvore [orgSlug] chamam isso na mesma requisição.
// Retorna null (não lança) pra slug inexistente — cada chamador decide o
// que fazer (layout faz notFound(), uma Server Action devolve erro
// genérico). NUNCA tratar o resultado desta função como "seguro só por ter
// vindo do banco" sem checar o campo `active` quando a operação exigir
// organização ativa — ver plano, seção "Modelo de isolamento e fronteira de
// segurança".
export const getOrganizationBySlug = cache(async (slug: string) => {
  return prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, active: true },
  });
});
