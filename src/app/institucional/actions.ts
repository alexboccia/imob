"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { telefoneValido } from "@/lib/telefone";
import { obterIpCliente } from "@/lib/client-ip";
import { obterKvStore } from "@/lib/kv-store";
import { normalizarEmail, verificarLimiteLeadInstitucional } from "@/lib/rate-limit";
import { registrarAbuso } from "@/lib/abuse-log";
import { hashCurto } from "@/lib/hash";
import { enviarEmailLeadInstitucional } from "@/lib/email";
import { type ActionState, erroValidacao, erroGenerico, sucesso } from "@/lib/action-result";

// Formulário "Agendar demonstração" do site institucional
// (syntaks.com.br) — ver briefing, seção 6. Não existe CRM/destino
// comercial definido ainda (ver docs/comercial/00-diagnostico-produto.md),
// então o lead só é entregue por e-mail (enviarEmailLeadInstitucional);
// nada é persistido em banco aqui de propósito — não há tabela pra isto
// hoje, e fingir que "ficou salvo" sem um destino real seria pior do que
// dizer claramente que não deu certo.

const leadSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome.").max(120, "Use no máximo 120 caracteres."),
  email: z.string().trim().email("E-mail inválido."),
  whatsapp: z
    .string()
    .trim()
    .refine((v) => telefoneValido(v), "WhatsApp inválido."),
  nomeImobiliaria: z
    .string()
    .trim()
    .min(2, "Informe o nome da sua imobiliária.")
    .max(120, "Use no máximo 120 caracteres."),
});

// Menos de 1.5s entre o formulário aparecer na tela e ser enviado não é
// tempo humano realista — mesmo limiar de [orgSlug]/actions.ts.
const LIMIAR_MUITO_RAPIDO_MS = 1500;

export async function solicitarDemonstracao(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Honeypot: campo invisível pra humanos. Preenchido = bot. "Sucesso"
  // silencioso, pra não ensinar o bot a se adaptar.
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    registrarAbuso({ tipo: "lead_institucional", motivo: "honeypot" });
    return sucesso();
  }

  const renderizadoEm = Number(formData.get("renderizadoEm"));
  if (Number.isFinite(renderizadoEm) && Date.now() - renderizadoEm < LIMIAR_MUITO_RAPIDO_MS) {
    registrarAbuso({ tipo: "lead_institucional", motivo: "muito_rapido" });
    return erroGenerico("Envio muito rápido. Tente novamente.");
  }

  const parsed = leadSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return erroValidacao(parsed.error);
  const dados = parsed.data;

  const emailNormalizado = normalizarEmail(dados.email);
  const ip = obterIpCliente(await headers());

  const store = obterKvStore();
  if (store) {
    const limite = await verificarLimiteLeadInstitucional(store, { ip, emailNormalizado });
    if (!limite.permitido) {
      registrarAbuso({
        tipo: "lead_institucional",
        motivo: `rate_limit_${limite.motivo}`,
        ip,
        identificadorHash: emailNormalizado ? hashCurto(emailNormalizado) : undefined,
      });
      return erroGenerico("Muitas tentativas. Tente novamente mais tarde.");
    }
  }

  const { enviado } = await enviarEmailLeadInstitucional({
    nome: dados.nome,
    email: dados.email,
    whatsapp: dados.whatsapp,
    nomeImobiliaria: dados.nomeImobiliaria,
  });

  if (!enviado) {
    // Nunca finge sucesso: sem RESEND_API_KEY/RESEND_FROM_EMAIL/
    // INSTITUTIONAL_LEADS_EMAIL configurados, o pedido genuinamente não
    // chega a ninguém — a pessoa precisa saber que precisa tentar outro
    // canal, não achar que alguém vai retornar.
    return erroGenerico(
      "Não foi possível enviar seu pedido agora. Tente novamente em instantes ou fale com a gente por outro canal."
    );
  }

  return sucesso();
}
