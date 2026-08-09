"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { enviarEmailContato } from "@/lib/email";
import { contatoSchema, anuncieSchema } from "@/lib/contato-schema";
import { getOrganizationBySlug } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { obterIpCliente } from "@/lib/client-ip";
import { obterKvStore } from "@/lib/kv-store";
import { verificarLimiteFormulario, normalizarContato, type FormularioTipo } from "@/lib/rate-limit";
import { registrarAbuso } from "@/lib/abuse-log";
import { hashCurto } from "@/lib/hash";

// orgSlug chega via .bind(null, orgSlug) nos Client Components que chamam
// estas actions (ContatoForm/AnuncieForm/FormularioContato) — é input do
// navegador como qualquer outro (o bind pode ser reescrito via DevTools),
// então é sempre resolvido e revalidado aqui, nunca aceito como
// organizationId direto. Ver plano, seção "Modelo de isolamento e
// fronteira de segurança".
async function resolverOrganizacaoAtiva(
  orgSlug: string
): Promise<{ organizationId: string } | { erro: string }> {
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    return { erro: "Organização não encontrada." };
  }
  // Organização suspensa não deve continuar recebendo leads — ver plano,
  // seção "Modelo de isolamento". Mensagem genérica, não revela suspensão.
  if (!organization.active) {
    return { erro: "Formulário indisponível no momento." };
  }
  return { organizationId: organization.id };
}

// Menos de 1.5s entre o formulário aparecer na tela e ser enviado não é
// tempo humano realista de preencher nome/telefone/mensagem — quase
// sempre é um bot que já chega com o payload pronto.
const LIMIAR_MUITO_RAPIDO_MS = 1500;
const MENSAGEM_LIMITE_EXCEDIDO = "Muitas tentativas. Tente novamente mais tarde.";

async function protecoesAntiSpam(params: {
  formulario: FormularioTipo;
  formData: FormData;
  organizationId: string;
  contatoNormalizado: string;
}): Promise<{ bloqueado: true; erro: string } | { bloqueado: false }> {
  const ip = obterIpCliente(await headers());

  // Honeypot: campo invisível pra humanos. Preenchido = bot. Devolve
  // "sucesso" sem gravar nada, pra não ensinar o bot a se adaptar.
  const honeypot = params.formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    registrarAbuso({ tipo: params.formulario, motivo: "honeypot", organizationId: params.organizationId, ip });
    return { bloqueado: true, erro: "" }; // erro vazio = chamador trata como sucesso silencioso
  }

  const renderizadoEm = Number(params.formData.get("renderizadoEm"));
  if (Number.isFinite(renderizadoEm) && Date.now() - renderizadoEm < LIMIAR_MUITO_RAPIDO_MS) {
    registrarAbuso({ tipo: params.formulario, motivo: "muito_rapido", organizationId: params.organizationId, ip });
    return { bloqueado: true, erro: "Envio muito rápido. Tente novamente." };
  }

  const store = obterKvStore();
  if (store) {
    const limite = await verificarLimiteFormulario(store, {
      formulario: params.formulario,
      ip,
      organizationId: params.organizationId,
      contatoNormalizado: params.contatoNormalizado,
    });
    if (!limite.permitido) {
      registrarAbuso({
        tipo: params.formulario,
        motivo: `rate_limit_${limite.motivo}`,
        organizationId: params.organizationId,
        ip,
        identificadorHash: params.contatoNormalizado ? hashCurto(params.contatoNormalizado) : undefined,
      });
      return { bloqueado: true, erro: MENSAGEM_LIMITE_EXCEDIDO };
    }
  }

  return { bloqueado: false };
}

export async function enviarContato(
  orgSlug: string,
  _prevState: unknown,
  formData: FormData
) {
  const parsed = contatoSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    mensagem: formData.get("mensagem"),
    imovelId: formData.get("imovelId") || undefined,
  });

  if (!parsed.success) {
    return { sucesso: false, erro: "Preencha os campos corretamente." };
  }

  const { nome, email, telefone, mensagem, imovelId } = parsed.data;

  const org = await resolverOrganizacaoAtiva(orgSlug);
  if ("erro" in org) return { sucesso: false, erro: org.erro };
  const { organizationId } = org;

  const protecao = await protecoesAntiSpam({
    formulario: "contato",
    formData,
    organizationId,
    contatoNormalizado: normalizarContato(email, telefone),
  });
  if (protecao.bloqueado) {
    return protecao.erro ? { sucesso: false, erro: protecao.erro } : { sucesso: true };
  }

  const { imovel, configContato } = await withOrganization(organizationId, async () => {
    // O imovelId chega do formulário (input não confiável) — precisa
    // pertencer a ESTA organização antes de virar o propertyId de uma
    // Interaction. Sem essa checagem, um imovelId de outra organização
    // criaria uma Interaction cruzando tenants (organizationId correto,
    // mas propertyId apontando pra um Property de outra org). Ver plano,
    // seção "Modelo de isolamento e fronteira de segurança".
    const imovel = imovelId
      ? await prisma.property.findUnique({
          where: { id: imovelId, organizationId },
          select: {
            title: true,
            responsibleMember: { select: { contactEmail: true } },
          },
        })
      : null;
    const imovelIdValidado = imovelId && imovel ? imovelId : null;

    const pessoa = await prisma.person.create({
      data: {
        organizationId,
        name: nome,
        email: email || null,
        phone: telefone || null,
        roles: ["LEAD"],
        source: "WEBSITE",
      },
    });

    await prisma.interaction.create({
      data: {
        organizationId,
        personId: pessoa.id,
        propertyId: imovelIdValidado,
        type: "MESSAGE",
        notes: mensagem,
      },
    });

    const configContato = await buscarConfiguracaoContato(organizationId);

    return { imovel, configContato };
  });

  const emailDestino = imovel?.responsibleMember?.contactEmail || configContato.email;

  if (emailDestino && (await hasModule(organizationId, "email"))) {
    await enviarEmailContato({
      para: emailDestino,
      nomeLead: nome,
      emailLead: email || null,
      telefoneLead: telefone || null,
      mensagem,
      imovelTitulo: imovel?.title,
    });
  }

  return { sucesso: true };
}

export async function enviarAnuncioProprietario(
  orgSlug: string,
  _prevState: unknown,
  formData: FormData
) {
  const parsed = anuncieSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    descricaoImovel: formData.get("descricaoImovel"),
  });

  if (!parsed.success) {
    return { sucesso: false, erro: "Preencha os campos corretamente." };
  }

  const { nome, email, telefone, descricaoImovel } = parsed.data;

  const org = await resolverOrganizacaoAtiva(orgSlug);
  if ("erro" in org) return { sucesso: false, erro: org.erro };
  const { organizationId } = org;

  const protecao = await protecoesAntiSpam({
    formulario: "anuncie",
    formData,
    organizationId,
    contatoNormalizado: normalizarContato(email, telefone),
  });
  if (protecao.bloqueado) {
    return protecao.erro ? { sucesso: false, erro: protecao.erro } : { sucesso: true };
  }

  await withOrganization(organizationId, async () => {
    await prisma.person.create({
      data: {
        organizationId,
        name: nome,
        email: email || null,
        phone: telefone,
        roles: ["OWNER"],
        source: "WEBSITE",
        notes: `Quer anunciar imóvel: ${descricaoImovel}`,
      },
    });
  });

  return { sucesso: true };
}
