"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const numeroOpcional = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().optional()
);

const booleanCheckbox = z.preprocess((v) => v === "on", z.boolean());

function parseMesAno(valor: string | undefined): Date | null {
  if (!valor) return null;
  const [ano, mes] = valor.split("-").map(Number);
  if (!ano || !mes) return null;
  return new Date(Date.UTC(ano, mes - 1, 1));
}

const imovelSchema = z.object({
  titulo: z.string().min(3),
  descricao: z.string().optional(),
  tipo: z.enum([
    "APARTAMENTO",
    "CASA",
    "CASA_CONDOMINIO",
    "TERRENO",
    "COMERCIAL",
    "RURAL",
    "COBERTURA",
    "OUTRO",
  ]),
  finalidade: z.enum(["VENDA", "ALUGUEL", "VENDA_E_ALUGUEL"]),
  status: z.enum([
    "RASCUNHO",
    "DISPONIVEL",
    "RESERVADO",
    "VENDIDO",
    "ALUGADO",
    "INATIVO",
  ]),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().min(1),
  cidade: z.string().min(1),
  estado: z.string().min(2).max(2),
  latitude: numeroOpcional,
  longitude: numeroOpcional,
  preco: numeroOpcional,
  precoAluguel: numeroOpcional,
  precoCondominio: numeroOpcional,
  precoIptu: numeroOpcional,
  areaTotal: numeroOpcional,
  areaPrivativa: numeroOpcional,
  quartos: numeroOpcional,
  suites: numeroOpcional,
  banheiros: numeroOpcional,
  vagasGaragem: numeroOpcional,
  lancamento: booleanCheckbox,
  destaque: booleanCheckbox,
  oportunidade: booleanCheckbox,
  slideshow: booleanCheckbox,
  estagioObra: z
    .enum(["NA_PLANTA", "EM_CONSTRUCAO", "PRONTO_PARA_MORAR"])
    .optional()
    .or(z.literal("")),
  previsaoEntrega: z.string().optional(),
  construtora: z.string().optional(),
  midiasJson: z.string().optional(),
});

function parseFormData(formData: FormData) {
  const bruto = Object.fromEntries(formData.entries());
  const dados = imovelSchema.parse(bruto);
  return {
    ...dados,
    caracteristicasImovel: formData.getAll("caracteristicasImovel").map(String),
    caracteristicasCondominio: formData
      .getAll("caracteristicasCondominio")
      .map(String),
  };
}

function parseMidias(json: string | undefined) {
  if (!json) return [];
  try {
    const midias = JSON.parse(json) as {
      tipo: "FOTO" | "VIDEO" | "PLANTA";
      url: string;
      ehCapa: boolean;
    }[];
    return midias.map((m, i) => ({ ...m, ordem: i }));
  } catch {
    return [];
  }
}

export async function criarImovel(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const dados = parseFormData(formData);
  const midias = parseMidias(dados.midiasJson);

  const imovel = await prisma.imovel.create({
    data: {
      titulo: dados.titulo,
      descricao: dados.descricao || null,
      tipo: dados.tipo,
      finalidade: dados.finalidade,
      status: dados.status,
      cep: dados.cep || null,
      logradouro: dados.logradouro || null,
      numero: dados.numero || null,
      complemento: dados.complemento || null,
      bairro: dados.bairro,
      cidade: dados.cidade,
      estado: dados.estado.toUpperCase(),
      latitude: dados.latitude ?? null,
      longitude: dados.longitude ?? null,
      preco: dados.preco ?? null,
      precoAluguel: dados.precoAluguel ?? null,
      precoCondominio: dados.precoCondominio ?? null,
      precoIptu: dados.precoIptu ?? null,
      areaTotal: dados.areaTotal ?? null,
      areaPrivativa: dados.areaPrivativa ?? null,
      quartos: dados.quartos ?? null,
      suites: dados.suites ?? null,
      banheiros: dados.banheiros ?? null,
      vagasGaragem: dados.vagasGaragem ?? null,
      caracteristicasImovel: dados.caracteristicasImovel,
      caracteristicasCondominio: dados.caracteristicasCondominio,
      lancamento: dados.lancamento,
      destaque: dados.destaque,
      oportunidade: dados.oportunidade,
      slideshow: dados.slideshow,
      estagioObra: dados.estagioObra || null,
      previsaoEntrega: parseMesAno(dados.previsaoEntrega),
      construtora: dados.construtora || null,
      corretorResponsavelId: session.user.id,
      publicadoEm: dados.status === "DISPONIVEL" ? new Date() : null,
      midias: { create: midias },
      historicoStatus: {
        create: { statusAnterior: null, statusNovo: dados.status },
      },
    },
  });

  revalidatePath("/admin/imoveis");
  redirect(`/admin/imoveis/${imovel.id}?salvo=1`);
}

export async function atualizarImovel(imovelId: string, formData: FormData) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const dados = parseFormData(formData);
  const midias = parseMidias(dados.midiasJson);

  const imovelAtual = await prisma.imovel.findUniqueOrThrow({
    where: { id: imovelId },
    select: { status: true, publicadoEm: true },
  });

  const statusMudou = imovelAtual.status !== dados.status;

  await prisma.$transaction([
    prisma.midia.deleteMany({ where: { imovelId } }),
    prisma.imovel.update({
      where: { id: imovelId },
      data: {
        titulo: dados.titulo,
        descricao: dados.descricao || null,
        tipo: dados.tipo,
        finalidade: dados.finalidade,
        status: dados.status,
        cep: dados.cep || null,
        logradouro: dados.logradouro || null,
        numero: dados.numero || null,
        complemento: dados.complemento || null,
        bairro: dados.bairro,
        cidade: dados.cidade,
        estado: dados.estado.toUpperCase(),
        latitude: dados.latitude ?? null,
        longitude: dados.longitude ?? null,
        preco: dados.preco ?? null,
        precoAluguel: dados.precoAluguel ?? null,
        precoCondominio: dados.precoCondominio ?? null,
        precoIptu: dados.precoIptu ?? null,
        areaTotal: dados.areaTotal ?? null,
        areaPrivativa: dados.areaPrivativa ?? null,
        quartos: dados.quartos ?? null,
        suites: dados.suites ?? null,
        banheiros: dados.banheiros ?? null,
        vagasGaragem: dados.vagasGaragem ?? null,
        caracteristicasImovel: dados.caracteristicasImovel,
        caracteristicasCondominio: dados.caracteristicasCondominio,
        lancamento: dados.lancamento,
        destaque: dados.destaque,
        oportunidade: dados.oportunidade,
        slideshow: dados.slideshow,
        estagioObra: dados.estagioObra || null,
        previsaoEntrega: parseMesAno(dados.previsaoEntrega),
        construtora: dados.construtora || null,
        publicadoEm:
          dados.status === "DISPONIVEL" && !imovelAtual.publicadoEm
            ? new Date()
            : undefined,
        midias: { create: midias },
        ...(statusMudou
          ? {
              historicoStatus: {
                create: {
                  statusAnterior: imovelAtual.status,
                  statusNovo: dados.status,
                },
              },
            }
          : {}),
      },
    }),
  ]);

  revalidatePath("/admin/imoveis");
  revalidatePath(`/admin/imoveis/${imovelId}`);
  redirect(`/admin/imoveis/${imovelId}?salvo=1`);
}
