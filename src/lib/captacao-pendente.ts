import { prisma } from "@/lib/prisma";
import { withOrganization } from "@/lib/tenant-context";
import { normalizarEmail } from "@/lib/rate-limit";
import { normalizarTelefone } from "@/lib/telefone";
import type { LeadCaptureStatus } from "@/generated/prisma/client";

// =======================================================================
// Captações pendentes de identificação (Fase 24)
// =======================================================================
// Leitura e resolução da fila. O princípio que este arquivo sustenta:
//
//   O SISTEMA PODE NÃO SABER QUEM É A PESSOA,
//   MAS NÃO PODE ESQUECER QUE O CONTATO ACONTECEU.
//
// A ambiguidade de identidade não é permissão para perder lead — e
// também não é permissão para adivinhar. Quem escolhe é uma pessoa
// autorizada, explicitamente, e o que ela escolhe é apenas ONDE o
// contato entra: nada do cadastro existente é alterado.

// Teto de exibição da fila. A Central mostra a CONTAGEM exata e uma
// lista curta; a tela própria pagina. Nunca carregar histórico inteiro.
export const LIMITE_FILA_CAPTACAO = 20;

export type CandidatoIdentidade = {
  personId: string;
  nome: string;
  // Por qual dado esta pessoa foi encontrada. É o que permite ao gestor
  // decidir com fundamento em vez de escolher no escuro.
  porEmail: boolean;
  porTelefone: boolean;
};

export type CaptacaoPendente = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  mensagem: string | null;
  origin: string;
  ocorridoEmISO: string;
  imovel: { id: string; title: string } | null;
  candidatos: CandidatoIdentidade[];
};

export async function contarCaptacoesPendentes(organizationId: string): Promise<number> {
  return withOrganization(organizationId, () =>
    prisma.leadCapture.count({ where: { organizationId, status: "PENDING" } })
  );
}

// Candidatos RECALCULADOS na hora, nunca lidos de colunas congeladas na
// captação: entre o envio e a resolução a Person pode ter sido editada,
// ter trocado de e-mail/telefone ou ter sido desativada. Recalcular usa
// exatamente os mesmos normalizadores do dedupe público, então a fila
// mostra a realidade de agora — não um palpite de semanas atrás.
async function candidatosDe(
  organizationId: string,
  email: string | null,
  telefone: string | null
): Promise<CandidatoIdentidade[]> {
  const emailNormalized = email ? normalizarEmail(email) : null;
  const phoneNormalized = telefone ? normalizarTelefone(telefone) : null;

  const [porEmail, porTelefone] = await Promise.all([
    emailNormalized
      ? prisma.person.findFirst({
          where: { organizationId, emailNormalized },
          select: { id: true, name: true },
        })
      : null,
    phoneNormalized
      ? prisma.person.findFirst({
          where: { organizationId, phoneNormalized },
          select: { id: true, name: true },
        })
      : null,
  ]);

  const porId = new Map<string, CandidatoIdentidade>();
  if (porEmail) {
    porId.set(porEmail.id, {
      personId: porEmail.id,
      nome: porEmail.name,
      porEmail: true,
      porTelefone: false,
    });
  }
  if (porTelefone) {
    const existente = porId.get(porTelefone.id);
    if (existente) existente.porTelefone = true;
    else
      porId.set(porTelefone.id, {
        personId: porTelefone.id,
        nome: porTelefone.name,
        porEmail: false,
        porTelefone: true,
      });
  }
  return [...porId.values()];
}

// Fila operacional: mais antiga primeiro (é uma fila, não um feed).
// Um único `findMany` + uma consulta de candidatos POR CAPTAÇÃO — que é
// no máximo `limite` (20), não por linha de um conjunto ilimitado.
export async function buscarCaptacoesPendentes(
  organizationId: string,
  opcoes: { limite?: number } = {}
): Promise<CaptacaoPendente[]> {
  const limite = opcoes.limite ?? LIMITE_FILA_CAPTACAO;

  return withOrganization(organizationId, async () => {
    const linhas = await prisma.leadCapture.findMany({
      where: { organizationId, status: "PENDING" },
      orderBy: { occurredAt: "asc" },
      take: limite,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        message: true,
        origin: true,
        occurredAt: true,
        property: { select: { id: true, title: true, organizationId: true } },
      },
    });

    return Promise.all(
      linhas.map(async (linha) => ({
        id: linha.id,
        nome: linha.name,
        email: linha.email,
        telefone: linha.phone,
        mensagem: linha.message,
        origin: linha.origin,
        ocorridoEmISO: linha.occurredAt.toISOString(),
        // Mesma defesa em profundidade do resto do CRM: relação anômala
        // cross-tenant é redigida, nunca exibida.
        imovel:
          linha.property && linha.property.organizationId === organizationId
            ? { id: linha.property.id, title: linha.property.title }
            : null,
        candidatos: await candidatosDe(organizationId, linha.email, linha.phone),
      }))
    );
  });
}

export type ResultadoResolucao =
  | { tipo: "resolvida"; personId: string; interactionId: string }
  // Segunda resolução da mesma captação: não é erro, é estado. Nenhuma
  // segunda Interaction é criada.
  | { tipo: "ja_resolvida" }
  | { tipo: "nao_encontrada" }
  | { tipo: "pessoa_invalida" };

export type StatusCaptacao = LeadCaptureStatus;
