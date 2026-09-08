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
  // outra) e por isso não vinculou este contato a nenhum Person/Interaction.
  //
  // Fase 24 — o contato NÃO depende mais deste e-mail para existir: ele
  // está salvo como captação pendente antes do envio. O aviso deixou de
  // ser um pedido de socorro e virou o que sempre deveria ter sido — a
  // indicação de onde concluir o trabalho.
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
      ? "\nEste contato corresponde a mais de um cliente cadastrado, então não foi vinculado automaticamente. Ele está guardado em Contatos a identificar, no painel, esperando a escolha do cliente correto."
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

// =======================================================================
// Convite de membro (Fase 25)
// =======================================================================
// Separado de enviarEmailConviteOwner porque a mensagem é outra: aqui
// existe quem convidou e existe um papel na equipe, e o destinatário
// pode já ter conta. O que os dois compartilham é o essencial:
// NENHUMA SENHA no corpo, link de uso único, prazo declarado.
export async function enviarEmailConviteMembro({
  organizationId,
  para,
  nomeOrganizacao,
  nomeQuemConvidou,
  linkConvite,
  jaTemConta,
}: {
  organizationId: string;
  para: string;
  nomeOrganizacao: string;
  // Quem convidou aparece porque um convite sem remetente humano parece
  // phishing — é a informação que permite ao destinatário reconhecer
  // que o e-mail era esperado.
  nomeQuemConvidou: string;
  linkConvite: string;
  jaTemConta: boolean;
}): Promise<{ enviado: boolean }> {
  const cliente = obterCliente();
  if (!cliente) {
    logger.warn("RESEND_API_KEY não configurada — convite de membro não foi enviado", {
      organizationId,
      modulo: "email",
    });
    return { enviado: false };
  }

  const remetente = await resolverRemetente(organizationId);
  if (!remetente) {
    logger.warn("RESEND_FROM_EMAIL não configurado — convite de membro não foi enviado", {
      organizationId,
      modulo: "email",
    });
    return { enviado: false };
  }

  const linhas = [
    `${nomeQuemConvidou} convidou você para a equipe de "${nomeOrganizacao}" no EasyMob.`,
    "",
    jaTemConta
      ? "Você já tem uma conta no EasyMob. Aceite o convite pelo link abaixo — sua senha continua a mesma:"
      : "Crie sua senha e ative sua conta pelo link abaixo:",
    linkConvite,
    "",
    "Este link expira em 7 dias e só pode ser usado uma vez.",
  ];

  try {
    await cliente.emails.send({
      from: remetente,
      to: para,
      subject: `Convite para a equipe de ${nomeOrganizacao} — EasyMob`,
      text: linhas.join("\n"),
    });
    return { enviado: true };
  } catch (erro) {
    // NUNCA logar linkConvite: ele contém o token bruto.
    logger.error("Falha ao enviar convite de membro", erro, {
      organizationId,
      modulo: "email",
    });
    return { enviado: false };
  }
}

// =======================================================================
// Recuperação de senha (Fase 25)
// =======================================================================
// Sem organizationId: a senha é do User, global. Usar o remetente de uma
// organização aqui criaria uma dependência perigosa — a recuperação de
// quem é membro de duas imobiliárias passaria a depender de qual delas
// foi escolhida, e o e-mail revelaria ao destinatário de qual conta se
// trata antes mesmo de ele provar identidade. Remetente global, sempre.
export async function enviarEmailRecuperacaoSenha({
  para,
  linkRedefinicao,
}: {
  para: string;
  linkRedefinicao: string;
}): Promise<{ enviado: boolean }> {
  const cliente = obterCliente();
  if (!cliente) {
    // Sem e-mail do destinatário no log: quem pediu recuperação é PII, e
    // este aviso é sobre CONFIGURAÇÃO, não sobre a pessoa.
    logger.warn("RESEND_API_KEY não configurada — recuperação de senha não foi enviada", {
      modulo: "email",
    });
    return { enviado: false };
  }

  const remetente = process.env.RESEND_FROM_EMAIL ?? null;
  if (!remetente) {
    logger.warn("RESEND_FROM_EMAIL não configurado — recuperação de senha não foi enviada", {
      modulo: "email",
    });
    return { enviado: false };
  }

  const linhas = [
    "Recebemos um pedido para redefinir a senha da sua conta no EasyMob.",
    "",
    "Escolha uma nova senha pelo link abaixo:",
    linkRedefinicao,
    "",
    "Este link expira em 60 minutos e só pode ser usado uma vez.",
    "",
    "Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.",
  ];

  try {
    await cliente.emails.send({
      from: remetente,
      to: para,
      subject: "Redefinir sua senha — EasyMob",
      text: linhas.join("\n"),
    });
    return { enviado: true };
  } catch (erro) {
    // NUNCA logar linkRedefinicao nem o e-mail do destinatário.
    logger.error("Falha ao enviar e-mail de recuperação de senha", erro, {
      modulo: "email",
    });
    return { enviado: false };
  }
}

// =======================================================================
// Cadastro de imobiliária (Fase 26)
// =======================================================================
// Sem organizationId — a organização AINDA NÃO EXISTE, e é justamente
// esse o ponto do fluxo: o link deste e-mail é o que prova posse da
// identidade antes de qualquer tenant nascer. Remetente global, sempre.
export async function enviarEmailCadastroImobiliaria({
  para,
  nomeImobiliaria,
  linkCadastro,
}: {
  para: string;
  nomeImobiliaria: string;
  linkCadastro: string;
}): Promise<{ enviado: boolean }> {
  const cliente = obterCliente();
  if (!cliente) {
    logger.warn("RESEND_API_KEY não configurada — cadastro de imobiliária não foi enviado", {
      modulo: "email",
    });
    return { enviado: false };
  }

  const remetente = process.env.RESEND_FROM_EMAIL ?? null;
  if (!remetente) {
    logger.warn("RESEND_FROM_EMAIL não configurado — cadastro de imobiliária não foi enviado", {
      modulo: "email",
    });
    return { enviado: false };
  }

  const linhas = [
    `Recebemos um pedido para criar a conta de "${nomeImobiliaria}" no EasyMob.`,
    "",
    "Confirme pelo link abaixo para ativar sua conta e entrar:",
    linkCadastro,
    "",
    "Este link expira em 24 horas e só pode ser usado uma vez.",
    "",
    "Se você não pediu isso, ignore este e-mail: nada foi criado.",
  ];

  try {
    await cliente.emails.send({
      from: remetente,
      to: para,
      subject: "Confirme o cadastro da sua imobiliária — EasyMob",
      text: linhas.join("\n"),
    });
    return { enviado: true };
  } catch (erro) {
    // NUNCA logar linkCadastro (contém o token bruto) nem o destinatário.
    logger.error("Falha ao enviar e-mail de cadastro de imobiliária", erro, {
      modulo: "email",
    });
    return { enviado: false };
  }
}
