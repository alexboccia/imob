"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { enviarEmailContato } from "@/lib/email";
import { telefoneValido } from "@/lib/telefone";
import { getPublicOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";

const contatoSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z
    .string()
    .refine((v) => telefoneValido(v), "Telefone inválido")
    .optional()
    .or(z.literal("")),
  mensagem: z.string().min(5),
  imovelId: z.string().optional(),
});

export async function enviarContato(_prevState: unknown, formData: FormData) {
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

  const organizationId = await getPublicOrganizationId();

  const { imovel, configContato } = await withOrganization(organizationId, async () => {
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
        propertyId: imovelId || null,
        type: "MESSAGE",
        notes: mensagem,
      },
    });

    const imovel = imovelId
      ? await prisma.property.findUnique({
          where: { id: imovelId, organizationId },
          select: {
            title: true,
            responsibleMember: { select: { contactEmail: true } },
          },
        })
      : null;

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

const anuncieSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z.string().refine((v) => telefoneValido(v), "Telefone inválido"),
  descricaoImovel: z.string().min(5),
});

export async function enviarAnuncioProprietario(
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

  const organizationId = await getPublicOrganizationId();
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
