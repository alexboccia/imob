import { Resend } from "resend";
import { logger } from "@/lib/logger";

let clienteResend: Resend | null = null;

function obterCliente() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!clienteResend) {
    clienteResend = new Resend(apiKey);
  }
  return clienteResend;
}

export async function enviarEmailContato({
  para,
  nomeLead,
  emailLead,
  telefoneLead,
  mensagem,
  imovelTitulo,
}: {
  para: string;
  nomeLead: string;
  emailLead: string | null;
  telefoneLead: string | null;
  mensagem: string;
  imovelTitulo?: string;
}) {
  const cliente = obterCliente();
  if (!cliente) {
    logger.warn("RESEND_API_KEY não configurada — e-mail de contato não foi enviado", {
      modulo: "email",
    });
    return;
  }

  const remetente = process.env.RESEND_FROM_EMAIL;
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
