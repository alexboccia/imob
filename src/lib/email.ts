import { Resend } from "resend";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

let clienteResend: Resend | null = null;

function obterCliente() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!clienteResend) {
    clienteResend = new Resend(apiKey);
  }
  return clienteResend;
}

// Fase P.10 — remetente próprio por Organization (OrganizationEmailDomain),
// só quando status=ACTIVE (V1 nunca chama a API de domínio do Resend, o
// status é setado manualmente pelo Platform Operator — ver comentário do
// model no schema). Em QUALQUER outro caso (sem linha, PENDING/VERIFIED/
// FAILED, ou RESEND_FROM_EMAIL também ausente) cai no remetente global —
// nunca quebra envio existente (P.10.6.4). OrganizationEmailDomain está
// fora de TENANT_SCOPED_MODELS, então esta consulta funciona com o
// `organizationId` explícito abaixo sem nenhum bypass.
async function resolverRemetente(organizationId: string): Promise<string | null> {
  const emailDomain = await prisma.organizationEmailDomain.findUnique({
    where: { organizationId },
    select: { status: true, fromName: true, fromAddress: true },
  });
  if (emailDomain?.status === "ACTIVE") {
    return `${emailDomain.fromName} <${emailDomain.fromAddress}>`;
  }
  return process.env.RESEND_FROM_EMAIL ?? null;
}

export async function enviarEmailContato({
  organizationId,
  para,
  nomeLead,
  emailLead,
  telefoneLead,
  mensagem,
  imovelTitulo,
  avisoConflitoDedup,
}: {
  organizationId: string;
  para: string;
  nomeLead: string;
  emailLead: string | null;
  telefoneLead: string | null;
  mensagem: string;
  imovelTitulo?: string;
  // true quando a deduplicação de leads (src/lib/person-dedup.ts) detectou
  // conflito de identidade (e-mail bate numa Person, telefone bate em
  // outra) e por isso não vinculou este contato a nenhum Person/Interaction
  // — o corretor ainda recebe o contato, só precisa associar manualmente.
  // Nunca inclui ID interno nenhum, só o aviso.
  avisoConflitoDedup?: boolean;
}) {
  const cliente = obterCliente();
  if (!cliente) {
    logger.warn("RESEND_API_KEY não configurada — e-mail de contato não foi enviado", {
      modulo: "email",
    });
    return;
  }

  const remetente = await resolverRemetente(organizationId);
  if (!remetente) {
    logger.warn("RESEND_FROM_EMAIL não configurado — e-mail de contato não foi enviado", {
      modulo: "email",
    });
    return;
  }

  const assunto = imovelTitulo
    ? `Novo contato sobre: ${imovelTitulo}`
    : "Novo contato pelo site";

  const linhas = [
    `Nome: ${nomeLead}`,
    emailLead ? `E-mail: ${emailLead}` : null,
    telefoneLead ? `Telefone: ${telefoneLead}` : null,
    imovelTitulo ? `Imóvel: ${imovelTitulo}` : null,
    "",
    "Mensagem:",
    mensagem,
    avisoConflitoDedup
      ? "\nEste contato não foi vinculado automaticamente ao CRM. Revise os dados antes de associá-lo a um cliente."
      : null,
  ].filter((linha): linha is string => linha !== null);

  try {
    await cliente.emails.send({
      from: remetente,
      to: para,
      replyTo: emailLead || undefined,
      subject: assunto,
      text: linhas.join("\n"),
    });
  } catch (erro) {
    // Nunca passar nomeLead/emailLead/telefoneLead/mensagem como contexto
    // aqui — logger.error só encaminha pra Sentry os campos da allowlist
    // (ver src/lib/logger.ts), então nem vale a pena tentar.
    logger.error("Falha ao enviar e-mail de contato", erro, { modulo: "email" });
  }
}

// Diferente de enviarEmailContato: aqui o chamador (Create Organization,
// src/app/platform/organizations/nova/actions.ts) TRATA o resultado
// explicitamente — se `enviado: false`, mostra o link de convite na tela
// pra cópia manual, em vez de deixar o convite silenciosamente sem
// ninguém saber que ele nunca chegou. Ver plano, decisão #6.
export async function enviarEmailConviteOwner({
  organizationId,
  para,
  nomeOrganizacao,
  linkConvite,
}: {
  organizationId: string;
  para: string;
  nomeOrganizacao: string;
  linkConvite: string;
}): Promise<{ enviado: boolean }> {
  const cliente = obterCliente();
  if (!cliente) {
    logger.warn("RESEND_API_KEY não configurada — e-mail de convite não foi enviado", {
      modulo: "email",
    });
    return { enviado: false };
  }

  const remetente = await resolverRemetente(organizationId);
  if (!remetente) {
    logger.warn("RESEND_FROM_EMAIL não configurado — e-mail de convite não foi enviado", {
      modulo: "email",
    });
    return { enviado: false };
  }

  const linhas = [
    `Você foi convidado a administrar "${nomeOrganizacao}" no EasyMob.`,
    "",
    "Defina sua senha e ative sua conta pelo link abaixo:",
    linkConvite,
    "",
    "Este link expira em 7 dias e só pode ser usado uma vez.",
  ];

  try {
    await cliente.emails.send({
      from: remetente,
      to: para,
      subject: "Bem-vindo ao EasyMob — configure sua conta",
      text: linhas.join("\n"),
    });
    return { enviado: true };
  } catch (erro) {
    // Nunca logar o linkConvite (contém o token bruto) como contexto.
    logger.error("Falha ao enviar e-mail de convite", erro, { modulo: "email" });
    return { enviado: false };
  }
}
