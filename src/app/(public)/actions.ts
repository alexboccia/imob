"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { enviarEmailContato } from "@/lib/email";

const contatoSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z.string().min(8).optional().or(z.literal("")),
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

  const pessoa = await prisma.pessoa.create({
    data: {
      nome,
      email: email || null,
      telefone: telefone || null,
      papeis: ["LEAD"],
      origem: "SITE",
    },
  });

  await prisma.interacao.create({
    data: {
      pessoaId: pessoa.id,
      imovelId: imovelId || null,
      tipo: "MENSAGEM",
      notas: mensagem,
    },
  });

  const imovel = imovelId
    ? await prisma.imovel.findUnique({
        where: { id: imovelId },
        select: {
          titulo: true,
          corretorResponsavel: { select: { emailContato: true } },
        },
      })
    : null;

  const configContato = await buscarConfiguracaoContato();
  const emailDestino = imovel?.corretorResponsavel?.emailContato || configContato.email;

  if (emailDestino) {
    await enviarEmailContato({
      para: emailDestino,
      nomeLead: nome,
      emailLead: email || null,
      telefoneLead: telefone || null,
      mensagem,
      imovelTitulo: imovel?.titulo,
    });
  }

  return { sucesso: true };
}

const anuncieSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z.string().min(8),
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

  await prisma.pessoa.create({
    data: {
      nome,
      email: email || null,
      telefone,
      papeis: ["PROPRIETARIO"],
      origem: "SITE",
      observacoes: `Quer anunciar imóvel: ${descricaoImovel}`,
    },
  });

  return { sucesso: true };
}
