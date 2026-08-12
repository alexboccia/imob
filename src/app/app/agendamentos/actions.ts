"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity-log";
import {
  erroAcessoNegado,
  erroGenerico,
  erroValidacao,
  sucesso,
  type ActionState,
} from "@/lib/action-result";
import {
  criarAgendamentoVisitaSchema,
  remarcarAgendamentoVisitaSchema,
  parseScheduledAt,
} from "@/lib/scheduled-activity-schema";

// Server Actions da agenda de visitas (Fase H.2 do CRM) — arquivo dedicado,
// separado de clientes/actions.ts por decisão da própria H.1. Cobre
// exclusivamente ScheduledActivityType.VISIT (única variante da H.2);
// CALL/MESSAGE/FOLLOW_UP/DOCUMENT/OTHER continuam fora de escopo, sem
// alterar o enum.
//
// Fluxo obrigatório: Person + Property → PropertyInterest → ScheduledActivity
// VISIT. Nunca se cria uma visita a partir de personId/propertyId soltos —
// os formulários só enviam o id da linha que estão alterando
// (propertyInterestId pra criar, scheduledActivityId pra remarcar/
// cancelar/concluir); todo dado de identidade (person, property,
// organizationId, createdByMemberId) é derivado do banco a partir da
// sessão, nunca do FormData — reduz a superfície de IDOR (mesmo padrão já
// usado em criarInteressePessoa/atualizarEstagioInteresse).

function revalidarPaginasAgendamento(personId: string, propertyId: string | null) {
  revalidatePath(`/app/clientes/${personId}`);
  if (propertyId) revalidatePath(`/app/imoveis/${propertyId}`);
}

// Cria uma visita a partir de um PropertyInterest já existente.
export async function criarAgendamentoVisita(
  propertyInterestId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }

  const parsed = criarAgendamentoVisitaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const { notes } = parsed.data;
  const scheduledAt = parseScheduledAt(parsed.data.scheduledAt);

  if (scheduledAt.getTime() <= Date.now()) {
    return {
      success: false,
      message: "Verifique os campos destacados.",
      fieldErrors: { scheduledAt: ["A visita deve ser agendada para uma data futura."] },
    };
  }

  return withOrganization(organizationId, async () => {
    // PropertyInterest carregado com Person/Property inclusos, cada
    // organizationId reconferido individualmente — nunca confiar só no
    // organizationId da própria linha de PropertyInterest nem nas FKs
    // simples da H.1 (auditoria H.1, decisão #18: não existe FK composta
    // que garanta essa coerência no banco).
    const interesse = await prisma.propertyInterest.findUnique({
      where: { id: propertyInterestId, organizationId },
      select: {
        id: true,
        stage: true,
        personId: true,
        propertyId: true,
        person: { select: { organizationId: true } },
        property: { select: { organizationId: true, status: true } },
      },
    });

    if (
      !interesse ||
      interesse.person.organizationId !== organizationId ||
      interesse.property.organizationId !== organizationId
    ) {
      // Mensagem genérica de propósito — nunca revela se o registro
      // existe em outro tenant (mesmo padrão de criarInteressePessoa).
      return erroGenerico("Relacionamento não encontrado.");
    }

    // Regra aprovada: relacionamento encerrado não recebe nova visita.
    if (interesse.stage === "REJECTED") {
      return erroGenerico(
        "Este relacionamento foi encerrado — não é possível agendar uma nova visita."
      );
    }

    // propertyId/propertyInterestId são obrigatórios em regra de
    // aplicação pra type=VISIT nesta fase (o schema continua nullable —
    // ver AGENTS.md da H.2). Property precisa estar disponível pra
    // agendar visita nova (mesmo racional de criarInteressePessoa/Fase F:
    // relacionamento HISTÓRICO nunca é bloqueado por isso, só a criação).
    if (interesse.property.status !== "AVAILABLE") {
      return erroGenerico("Este imóvel não está disponível para agendar visita.");
    }

    // Múltiplas visitas são estruturalmente permitidas (H.1, sem unique) —
    // stage só avança de INTERESTED pra VISIT_SCHEDULED; qualquer outro
    // stage atual (VISIT_SCHEDULED, VISITED, PROPOSAL) permanece
    // intocado, nunca regride nem é sobrescrito.
    const stageDeveAvancar = interesse.stage === "INTERESTED";

    // ScheduledActivity.create + PropertyInterest.update (quando aplicável)
    // numa única transação — consistência entre as duas tabelas, sem ficar
    // parcialmente aplicado. Idempotência de duplo clique/corrida NÃO é
    // garantida aqui: não existe unique que identifique "o mesmo
    // agendamento" (decisão explícita da H.2 — nenhuma heurística por
    // data/hora foi criada, ver relatório final, seção "duplo clique").
    // A defesa é só de UX (botão desabilitado durante pendente).
    const agendamento = await prisma.$transaction(async (tx) => {
      const criado = await tx.scheduledActivity.create({
        data: {
          organizationId,
          personId: interesse.personId,
          propertyId: interesse.propertyId,
          propertyInterestId: interesse.id,
          type: "VISIT",
          scheduledAt,
          notes: notes || null,
          createdByMemberId: session.user.organizationMemberId ?? null,
        },
      });

      if (stageDeveAvancar) {
        await tx.propertyInterest.update({
          where: { id: interesse.id, organizationId },
          data: { stage: "VISIT_SCHEDULED" },
        });
      }

      return criado;
    });

    // ActivityLog fora da transação, best-effort (mesmo padrão de todo o
    // resto do projeto — logActivity nunca deve bloquear a operação
    // principal se falhar).
    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "ScheduledActivity",
      entityId: agendamento.id,
      action: "scheduled_activity_created",
    });
    if (stageDeveAvancar) {
      await logActivity({
        organizationId,
        userId: session.user.id,
        entity: "PropertyInterest",
        entityId: interesse.id,
        action: "property_interest_stage_changed",
        payload: { from: interesse.stage, to: "VISIT_SCHEDULED" },
      });
    }

    revalidarPaginasAgendamento(interesse.personId, interesse.propertyId);
    return sucesso("Visita agendada.");
  });
}

// Remarca (atualiza scheduledAt de) uma visita já agendada. Nunca cria uma
// nova linha — sempre a MESMA ScheduledActivity.
export async function remarcarAgendamentoVisita(
  scheduledActivityId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }

  const parsed = remarcarAgendamentoVisitaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const scheduledAt = parseScheduledAt(parsed.data.scheduledAt);

  if (scheduledAt.getTime() <= Date.now()) {
    return {
      success: false,
      message: "Verifique os campos destacados.",
      fieldErrors: { scheduledAt: ["A nova data deve ser no futuro."] },
    };
  }

  return withOrganization(organizationId, async () => {
    const atividade = await prisma.scheduledActivity.findUnique({
      where: { id: scheduledActivityId, organizationId },
      select: {
        id: true,
        status: true,
        personId: true,
        propertyId: true,
        scheduledAt: true,
        property: { select: { organizationId: true, status: true } },
      },
    });
    if (!atividade) return erroAcessoNegado("Agendamento não encontrado.");

    // Só SCHEDULED pode ser remarcada — COMPLETED/CANCELLED rejeitadas.
    if (atividade.status !== "SCHEDULED") {
      return erroGenerico("Só é possível remarcar uma visita agendada.");
    }

    // property é obrigatório em toda ScheduledActivity VISIT criada por
    // criarAgendamentoVisita — null/cross-tenant aqui só seria possível
    // numa linha que não passou por esse fluxo. Reconferido mesmo assim
    // (decisão #18 da H.2: nunca confiar só na FK simples).
    if (!atividade.property || atividade.property.organizationId !== organizationId) {
      return erroAcessoNegado("Agendamento não encontrado.");
    }

    // Preferência de produto: se o imóvel deixou de estar AVAILABLE,
    // bloquear remarcação (diferente de concluir, que permite mesmo
    // assim — ver concluirAgendamentoVisita).
    if (atividade.property.status !== "AVAILABLE") {
      return erroGenerico("Este imóvel não está mais disponível — remarcação bloqueada.");
    }

    const anterior = atividade.scheduledAt;
    await prisma.scheduledActivity.update({
      where: { id: atividade.id, organizationId },
      // status permanece SCHEDULED, completedAt/cancelledAt permanecem
      // null — nenhum dos três é tocado aqui, só scheduledAt.
      data: { scheduledAt },
    });

    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "ScheduledActivity",
      entityId: atividade.id,
      action: "scheduled_activity_rescheduled",
      payload: { from: anterior.toISOString(), to: scheduledAt.toISOString() },
    });

    revalidarPaginasAgendamento(atividade.personId, atividade.propertyId);
    return sucesso("Visita remarcada.");
  });
}

// Cancela uma visita agendada.
export async function cancelarAgendamentoVisita(
  scheduledActivityId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }

  return withOrganization(organizationId, async () => {
    const atividade = await prisma.scheduledActivity.findUnique({
      where: { id: scheduledActivityId, organizationId },
      select: { id: true, status: true, personId: true, propertyId: true },
    });
    if (!atividade) return erroAcessoNegado("Agendamento não encontrado.");

    // Idempotente: cancelar uma visita já CANCELLED é sucesso sem novo
    // efeito (sem ActivityLog duplicado) — nunca erro pra um duplo
    // clique/reload no meio do fluxo.
    if (atividade.status === "CANCELLED") {
      return sucesso("Visita já estava cancelada.");
    }
    if (atividade.status === "COMPLETED") {
      return erroGenerico("Não é possível cancelar uma visita já concluída.");
    }

    await prisma.scheduledActivity.update({
      where: { id: atividade.id, organizationId },
      // completedAt permanece null — não tocado.
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "ScheduledActivity",
      entityId: atividade.id,
      action: "scheduled_activity_cancelled",
    });

    // PropertyInterest.stage deliberadamente NÃO regride (ex:
    // VISIT_SCHEDULED continua VISIT_SCHEDULED mesmo com a visita
    // cancelada) — decisão de produto da H.2, ver relatório final.
    revalidarPaginasAgendamento(atividade.personId, atividade.propertyId);
    return sucesso("Visita cancelada.");
  });
}

// Conclui (marca como realizada) uma visita agendada — cria Interaction
// VISIT e, se o stage ainda for VISIT_SCHEDULED, avança pra VISITED.
export async function concluirAgendamentoVisita(
  scheduledActivityId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session) redirect("/app/login");

  const organizationId = await requireOrganizationId();
  if (!(await hasModule(organizationId, "crm"))) {
    return erroAcessoNegado("CRM não incluído no seu plano.");
  }

  return withOrganization(organizationId, async () => {
    const atividade = await prisma.scheduledActivity.findUnique({
      where: { id: scheduledActivityId, organizationId },
      select: {
        id: true,
        status: true,
        personId: true,
        propertyId: true,
        propertyInterestId: true,
        scheduledAt: true,
        person: { select: { organizationId: true } },
        property: { select: { organizationId: true } },
        propertyInterest: { select: { organizationId: true } },
      },
    });
    if (!atividade) return erroAcessoNegado("Agendamento não encontrado.");
    if (
      atividade.person.organizationId !== organizationId ||
      (atividade.propertyId && atividade.property?.organizationId !== organizationId) ||
      (atividade.propertyInterestId &&
        atividade.propertyInterest?.organizationId !== organizationId)
    ) {
      return erroAcessoNegado("Agendamento não encontrado.");
    }

    // Idempotente: concluir uma visita já COMPLETED é sucesso sem novo
    // efeito (sem Interaction/ActivityLog duplicados).
    if (atividade.status === "COMPLETED") {
      return sucesso("Visita já estava concluída.");
    }
    // Preferência de produto: concluir permitido mesmo que o Property
    // tenha mudado de status depois do agendamento (diferente de
    // remarcar) — a visita já aconteceu, o que importa é registrar isso.
    // REJECTED em PropertyInterest também não bloqueia conclusão (a
    // visita SCHEDULED realmente aconteceu), só o sync de stage é que
    // nunca acontece nesse caso (guard abaixo: só sincroniza se o stage
    // no momento da transação for exatamente VISIT_SCHEDULED).
    if (atividade.status === "CANCELLED") {
      return erroGenerico("Não é possível concluir uma visita cancelada.");
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // Guard atômico: updateMany com status:"SCHEDULED" no WHERE garante
      // que, sob concorrência (duas conclusões simultâneas da mesma
      // visita), só UMA delas efetivamente casa a linha — a segunda vê
      // count:0 e sabe que perdeu a corrida. É esse guard (apoiado no
      // isolamento de row-lock do Postgres em UPDATE), não um try/catch,
      // que garante uma única Interaction/ActivityLog mesmo sob
      // concorrência — sem precisar de lock distribuído.
      const atualizado = await tx.scheduledActivity.updateMany({
        where: { id: atividade.id, organizationId, status: "SCHEDULED" },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      if (atualizado.count === 0) {
        // Perdeu a corrida — mas count:0 não significa necessariamente
        // "outra requisição concluiu": também acontece se outra
        // requisição CANCELOU nessa mesma janela (entre o findUnique lá
        // em cima e este updateMany). Reconsulta o estado real DENTRO da
        // transação pra responder corretamente em vez de assumir sempre
        // "já concluída" — nenhum dado é escrito neste branch de
        // nenhuma forma (sem Interaction, sem ActivityLog).
        const atual = await tx.scheduledActivity.findUnique({
          where: { id: atividade.id, organizationId },
          select: { status: true },
        });
        if (atual?.status === "CANCELLED") {
          return { tipo: "foi_cancelada" as const };
        }
        if (!atual) {
          return { tipo: "nao_encontrada" as const };
        }
        // atual.status === "COMPLETED" (único outro caso possível aqui,
        // já que só COMPLETED/CANCELLED tiram a linha do WHERE
        // status:"SCHEDULED" do updateMany acima).
        return { tipo: "ja_concluida" as const };
      }

      // Stage relido DENTRO da transação (não o valor já obtido antes)
      // pra pegar o estado mais atual no instante da decisão — só avança
      // se for EXATAMENTE VISIT_SCHEDULED; qualquer outro valor (VISITED,
      // PROPOSAL, REJECTED, ou até INTERESTED por algum caminho
      // inesperado) fica intocado, nunca regride nem sobrescreve.
      let stageSincronizado = false;
      if (atividade.propertyInterestId) {
        const interesse = await tx.propertyInterest.findUnique({
          where: { id: atividade.propertyInterestId, organizationId },
          select: { stage: true },
        });
        if (interesse?.stage === "VISIT_SCHEDULED") {
          await tx.propertyInterest.update({
            where: { id: atividade.propertyInterestId, organizationId },
            data: { stage: "VISITED" },
          });
          stageSincronizado = true;
        }
      }

      // occurredAt = scheduledAt (preferência de produto): representa
      // quando a visita de fato ocorreu, não o instante em que alguém
      // clicou "concluir" (que pode ser bem depois). notes: null de
      // propósito — não gera texto automático nem duplica a nota do
      // agendamento no histórico de Interaction (evita vazar contexto
      // desnecessário fora do que já está em ScheduledActivity.notes).
      await tx.interaction.create({
        data: {
          organizationId,
          personId: atividade.personId,
          propertyId: atividade.propertyId,
          type: "VISIT",
          occurredAt: atividade.scheduledAt,
          notes: null,
          memberId: session.user.organizationMemberId ?? null,
        },
      });

      // ActivityLog DENTRO da transação — desvio deliberado do padrão
      // best-effort de logActivity() (que nunca bloqueia a operação
      // principal): aqui, ScheduledActivity/PropertyInterest/Interaction/
      // ActivityLog precisam ficar consistentes juntos ou não ficar
      // aplicados de jeito nenhum (decisão H.2, ver relatório final,
      // seção "transações").
      await tx.activityLog.create({
        data: {
          organizationId,
          userId: session.user.id,
          entity: "ScheduledActivity",
          entityId: atividade.id,
          action: "scheduled_activity_completed",
        },
      });
      if (stageSincronizado && atividade.propertyInterestId) {
        await tx.activityLog.create({
          data: {
            organizationId,
            userId: session.user.id,
            entity: "PropertyInterest",
            entityId: atividade.propertyInterestId,
            action: "property_interest_stage_changed",
            payload: { from: "VISIT_SCHEDULED", to: "VISITED" },
          },
        });
      }

      return { tipo: "concluida_agora" as const };
    });

    revalidarPaginasAgendamento(atividade.personId, atividade.propertyId);
    switch (resultado.tipo) {
      case "ja_concluida":
        return sucesso("Visita já estava concluída.");
      case "foi_cancelada":
        return erroGenerico("Não é possível concluir uma visita cancelada.");
      case "nao_encontrada":
        return erroAcessoNegado("Agendamento não encontrado.");
      case "concluida_agora":
        return sucesso("Visita concluída.");
    }
  });
}
